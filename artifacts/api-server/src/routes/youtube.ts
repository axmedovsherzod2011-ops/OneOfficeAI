import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import {
  usersTable,
  youtubeAccountsTable,
  productsTable,
  postsTable,
  MAX_YOUTUBE_ACCOUNTS_PER_USER,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";
import { createWriteStream, mkdirSync } from "fs";
import { rm, writeFile, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { GoogleGenAI } from "@google/genai";

const execFileAsync = promisify(execFile);
const router = Router();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function handle(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error("[youtube route]", err);
      res.status(500).json({
        error:
          "Serverda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.",
      });
    }
  };
}

async function getUserRowId(firebaseUid: string): Promise<number | null> {
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.firebaseUid, firebaseUid))
    .limit(1);
  return user?.id ?? null;
}

function getProfileOr401(req: any, res: any): string | null {
  const { userId: firebaseUid } = getAuth(req);
  if (!firebaseUid) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return null;
  }
  return firebaseUid;
}

function toAccountResponse(a: typeof youtubeAccountsTable.$inferSelect) {
  return {
    id: a.id,
    channelId: a.channelId,
    title: a.title,
    customUrl: a.customUrl,
    thumbnailUrl: a.thumbnailUrl,
  };
}

// ---------------------------------------------------------------------------
// Token refresh — called before every YouTube Data API request.
// Renews the access token if it expires within 5 minutes.
// ---------------------------------------------------------------------------

async function ensureFreshToken(
  account: typeof youtubeAccountsTable.$inferSelect,
): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;

  const expiresAt = account.tokenExpiresAt?.getTime() ?? 0;
  const fiveMinMs = 5 * 60 * 1000;
  if (Date.now() + fiveMinMs < expiresAt) {
    return account.accessToken; // still fresh
  }

  if (!account.refreshToken) {
    throw new Error(
      "Kirish tokeni eskirdi va yangilash uchun refresh token mavjud emas. YouTube kanalni qayta ulang.",
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new Error(
      `Token yangilash muvaffaqiyatsiz: ${data.error ?? "noma'lum xato"}`,
    );
  }

  const newExpiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
  await db
    .update(youtubeAccountsTable)
    .set({ accessToken: data.access_token, tokenExpiresAt: newExpiresAt })
    .where(eq(youtubeAccountsTable.id, account.id));

  return data.access_token;
}

// ---------------------------------------------------------------------------
// AI provider chain — reuses the same Groq→Cerebras→Gemini→Mistral
// fallback used in enrich.ts. Duplicated here to avoid coupling routes.
// ---------------------------------------------------------------------------

interface OpenAiCompatibleResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

async function callGroq(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 8192,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const err = new Error(`Groq ${res.status}: ${t.slice(0, 200)}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  const data = (await res.json()) as OpenAiCompatibleResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq javobida matn topilmadi");
  return content;
}

async function callCerebras(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch(
    "https://api.cerebras.ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 8192,
        temperature: 0.7,
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const err = new Error(
      `Cerebras ${res.status}: ${t.slice(0, 200)}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const data = (await res.json()) as OpenAiCompatibleResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Cerebras javobida matn topilmadi");
  return content;
}

async function callGeminiText(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const gemini = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;
  if (!gemini) throw new Error("GEMINI_API_KEY sozlanmagan");
  const result = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
    },
  });
  const content = result.text;
  if (!content) throw new Error("Gemini javobida matn topilmadi");
  return content;
}

async function callMistral(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 8192,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const err = new Error(
      `Mistral ${res.status}: ${t.slice(0, 200)}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const data = (await res.json()) as OpenAiCompatibleResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Mistral javobida matn topilmadi");
  return content;
}

function isRetryable(err: unknown): boolean {
  const status =
    (err as { status?: number })?.status ??
    (err as { code?: number })?.code;
  if (status === 503 || status === 429 || status === 500) return true;
  return /503|overloaded|429|rate limit|unavailable/i.test(
    String((err as Error)?.message ?? err ?? ""),
  );
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseMs = 1000,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === retries || !isRetryable(e)) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}

async function generateText(system: string, user: string): Promise<string> {
  type Provider = { name: string; enabled: boolean; call: () => Promise<string> };
  const providers: Provider[] = [
    {
      name: "Groq",
      enabled: !!process.env.GROQ_API_KEY,
      call: () => callGroq(system, user),
    },
    {
      name: "Cerebras",
      enabled: !!process.env.CEREBRAS_API_KEY,
      call: () => callCerebras(system, user),
    },
    {
      name: "Gemini",
      enabled: !!process.env.GEMINI_API_KEY,
      call: () => callGeminiText(system, user),
    },
    {
      name: "Mistral",
      enabled: !!process.env.MISTRAL_API_KEY,
      call: () => callMistral(system, user),
    },
  ];

  let lastErr: unknown;
  for (const p of providers) {
    if (!p.enabled) continue;
    try {
      return await withRetry(p.call);
    } catch (e) {
      console.warn(`[youtube] ${p.name} muvaffaqiyatsiz, keyingisiga o'tish:`, e);
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Hech qanday AI provayder sozlanmagan");
}

// ---------------------------------------------------------------------------
// Image download helper — saves each product image to a temp dir
// ---------------------------------------------------------------------------

async function downloadImage(
  url: string,
  dest: string,
): Promise<boolean> {
  try {
    // Handle base64 data: URLs (uploaded images)
    if (url.startsWith("data:")) {
      const match = url.match(/^data:[^;]+;base64,(.+)$/s);
      if (!match) return false;
      await writeFile(dest, Buffer.from(match[1], "base64"));
      return true;
    }
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "image/*",
      },
    });
    if (!res.ok || !res.body) return false;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return false;
    await pipeline(Readable.fromWeb(res.body as any), createWriteStream(dest));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// ffmpeg slideshow builder — creates an mp4 from 1+ images
// ---------------------------------------------------------------------------

async function buildSlideshowVideo(
  imagePaths: string[],
  outputPath: string,
  isShort: boolean,
): Promise<void> {
  const [w, h] = isShort ? [1080, 1920] : [1920, 1080];
  const secondsPerSlide = 3;

  // Concat filter: each image displayed for `secondsPerSlide` seconds,
  // scaled+padded to target resolution, with a silent AAC audio track so
  // YouTube accepts it (it rejects video-only uploads in some regions).
  //
  // Build the filter_complex dynamically for N inputs.
  const inputs: string[] = [];
  for (const p of imagePaths) {
    inputs.push("-loop", "1", "-t", String(secondsPerSlide), "-i", p);
  }

  const filterParts = imagePaths.map(
    (_, i) =>
      `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`,
  );
  const concatInputs = imagePaths.map((_, i) => `[v${i}]`).join("");
  const filterComplex = [
    ...filterParts,
    `${concatInputs}concat=n=${imagePaths.length}:v=1:a=0[vout]`,
    // Silent audio track so YouTube doesn't reject the upload
    `aevalsrc=0:c=stereo:r=44100:d=${imagePaths.length * secondsPerSlide}[aout]`,
  ].join(";");

  const args = [
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ];

  await execFileAsync("ffmpeg", args, { timeout: 120_000 });
}

// ---------------------------------------------------------------------------
// YouTube Data API v3 — resumable upload
// ---------------------------------------------------------------------------

async function uploadToYouTube(opts: {
  accessToken: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  isShort: boolean;
  videoPath: string;
  fileSize: number;
}): Promise<string> {
  const { accessToken, title, description, tags, categoryId, isShort, videoPath, fileSize } = opts;

  const body = JSON.stringify({
    snippet: {
      title: title.slice(0, 100),
      description,
      tags,
      categoryId,
    },
    status: {
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
    },
  });

  // Initiate the resumable upload
  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(fileSize),
      },
      body,
    },
  );

  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({})) as any;
    const code = err?.error?.errors?.[0]?.reason ?? "";
    if (code === "quotaExceeded") {
      throw new Error(
        "YouTube kunlik kvota tugadi. Ertaga qayta urinib ko'ring.",
      );
    }
    throw new Error(
      `YouTube yuklanish boshlanmadi: ${err?.error?.message ?? initRes.status}`,
    );
  }

  const uploadUrl = initRes.headers.get("Location");
  if (!uploadUrl) throw new Error("YouTube upload URL topilmadi");

  // Stream the video file to the resumable upload URL
  const { createReadStream, statSync } = await import("fs");
  const stream = createReadStream(videoPath);
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(fileSize),
    },
    body: Readable.toWeb(stream) as any,
    // @ts-ignore — Node 18+ supports duplex
    duplex: "half",
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({})) as any;
    throw new Error(
      `YouTube video yuklash muvaffaqiyatsiz: ${err?.error?.message ?? uploadRes.status}`,
    );
  }

  const data = (await uploadRes.json()) as { id?: string };
  if (!data.id) throw new Error("YouTube video ID qaytarilmadi");

  // For Shorts: YouTube determines Short eligibility based on aspect ratio
  // and duration — we don't need to do anything special here.
  void isShort;

  return data.id;
}

// ---------------------------------------------------------------------------
// GET /connectors/youtube/config
// ---------------------------------------------------------------------------
router.get("/connectors/youtube/config", (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const configured = Boolean(clientId && process.env.GOOGLE_CLIENT_SECRET);
  res.json({
    clientId,
    // Both scopes in one space-separated string — the frontend spreads them
    // into the authorize URL's `scope` param.
    scope:
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    configured,
  });
});

// ---------------------------------------------------------------------------
// GET /connectors/youtube — list connected channels for the signed-in user
// ---------------------------------------------------------------------------
router.get(
  "/connectors/youtube",
  handle(async (req, res) => {
    const firebaseUid = getProfileOr401(req, res);
    if (!firebaseUid) return;
    const userId = await getUserRowId(firebaseUid);
    if (!userId) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }
    const accounts = await db
      .select()
      .from(youtubeAccountsTable)
      .where(eq(youtubeAccountsTable.userId, userId));
    res.json(accounts.map(toAccountResponse));
  }),
);

// ---------------------------------------------------------------------------
// POST /connectors/youtube/exchange
// Exchange the Google OAuth `code` for tokens, fetch channel info, store.
// ---------------------------------------------------------------------------
router.post(
  "/connectors/youtube/exchange",
  handle(async (req, res) => {
    const firebaseUid = getProfileOr401(req, res);
    if (!firebaseUid) return;
    const userId = await getUserRowId(firebaseUid);
    if (!userId) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.status(400).json({
        error:
          "YouTube ulanishi hali sozlanmagan (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET server sozlamalarida yo'q).",
      });
      return;
    }

    const { code, redirectUri } = req.body as {
      code?: string;
      redirectUri?: string;
    };
    if (!code || !redirectUri) {
      res.status(400).json({ error: "code va redirectUri majburiy." });
      return;
    }

    // Check limit first
    const existing = await db
      .select({ id: youtubeAccountsTable.id })
      .from(youtubeAccountsTable)
      .where(eq(youtubeAccountsTable.userId, userId));
    if (existing.length >= MAX_YOUTUBE_ACCOUNTS_PER_USER) {
      res.status(400).json({
        error: `Siz eng ko'pi bilan ${MAX_YOUTUBE_ACCOUNTS_PER_USER} ta YouTube kanal ulashingiz mumkin.`,
      });
      return;
    }

    // 1) Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!tokenRes.ok || !tokenData.access_token) {
      res.status(400).json({
        error: `Google token olishda xato: ${tokenData.error ?? "noma'lum xato"}`,
      });
      return;
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token ?? null;
    const tokenExpiresAt = new Date(
      Date.now() + (tokenData.expires_in ?? 3600) * 1000,
    );

    // 2) Fetch the user's YouTube channel info
    let channelId = "";
    let title = "";
    let customUrl = "";
    let thumbnailUrl = "";
    try {
      const channelRes = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const channelData = (await channelRes.json()) as {
        items?: Array<{
          id?: string;
          snippet?: {
            title?: string;
            customUrl?: string;
            thumbnails?: { default?: { url?: string } };
          };
        }>;
      };
      const ch = channelData.items?.[0];
      if (ch) {
        channelId = ch.id ?? "";
        title = ch.snippet?.title ?? "";
        customUrl = ch.snippet?.customUrl ?? "";
        thumbnailUrl = ch.snippet?.thumbnails?.default?.url ?? "";
      }
    } catch (err) {
      console.warn("[youtube] channel info fetch failed (non-fatal):", err);
    }

    // 3) Upsert — same channel re-connected updates tokens
    const [already] = channelId
      ? await db
          .select({ id: youtubeAccountsTable.id })
          .from(youtubeAccountsTable)
          .where(
            and(
              eq(youtubeAccountsTable.userId, userId),
              eq(youtubeAccountsTable.channelId, channelId),
            ),
          )
      : [];

    const values = {
      userId,
      channelId: channelId || `google-${Date.now()}`,
      title,
      customUrl,
      thumbnailUrl,
      accessToken,
      refreshToken,
      tokenExpiresAt,
    };

    const [account] = already
      ? await db
          .update(youtubeAccountsTable)
          .set(values)
          .where(eq(youtubeAccountsTable.id, already.id))
          .returning()
      : await db.insert(youtubeAccountsTable).values(values).returning();

    res.json(toAccountResponse(account));
  }),
);

// ---------------------------------------------------------------------------
// DELETE /connectors/youtube/:id — disconnect a channel
// ---------------------------------------------------------------------------
router.delete(
  "/connectors/youtube/:id",
  handle(async (req, res) => {
    const firebaseUid = getProfileOr401(req, res);
    if (!firebaseUid) return;
    const userId = await getUserRowId(firebaseUid);
    if (!userId) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid account id" });
      return;
    }
    const deleted = await db
      .delete(youtubeAccountsTable)
      .where(
        and(
          eq(youtubeAccountsTable.id, id),
          eq(youtubeAccountsTable.userId, userId),
        ),
      )
      .returning({ id: youtubeAccountsTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// POST /connectors/youtube/metadata
// Generate YouTube-specific SEO metadata for a product using the AI chain.
// ---------------------------------------------------------------------------
router.post(
  "/connectors/youtube/metadata",
  handle(async (req, res) => {
    const firebaseUid = getProfileOr401(req, res);
    if (!firebaseUid) return;
    const userId = await getUserRowId(firebaseUid);
    if (!userId) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    const { productId, isShort = false } = req.body as {
      productId?: number;
      isShort?: boolean;
    };
    if (!productId) {
      res.status(400).json({ error: "productId majburiy." });
      return;
    }

    const [product] = await db
      .select()
      .from(productsTable)
      .where(
        and(
          eq(productsTable.id, productId),
          eq(productsTable.userId, userId),
        ),
      )
      .limit(1);

    if (!product) {
      res.status(404).json({ error: "Mahsulot topilmadi." });
      return;
    }

    const formatType = isShort ? "YouTube Short (≤60 soniya, vertikal)" : "YouTube Video";

    const system = `Sen professional YouTube content marketologi va SEO mutaxassissan. O'zbek e-tijorat sohasida ishlayman. Mening vazifam — mahsulot ma'lumotlari asosida ${formatType} uchun to'liq optimallashtirilgan YouTube metadata yaratish.

Javobni FAQAT quyidagi JSON formatda qaytar (boshqa hech narsa yozma):
{
  "title": "...",
  "description": "...",
  "tags": ["...", "..."],
  "hashtags": ["...", "..."]
}

Qoidalar:
- title: O'zbek va Rus tilida yozilishi mumkin, ≤100 ta belgi, kuchli hook va asosiy kalit so'zlar kirsin
- description: ≥300 so'z, inglizcha + o'zbekcha yoki ruscha aralash, boshida kuchli hook (birinchi 2 jumla), keyin mahsulot detallari, foydalanish qo'llanmasi, CTA ("Buyurtma uchun link:", "Izoh qoldiring:" kabi), va oxirida hashtag'lar
- tags: maks 30 ta tag, har biri ≤30 belgi, jami ≤500 belgi, eng qidiriladigan so'zlar
- hashtags: 10-15 ta hashtag, # belgisiz (description oxirida qo'shiladi)`;

    const userPrompt = `Mahsulot ma'lumotlari:
Nomi: ${product.name}
Narxi: ${product.sellPrice} ${product.currency}
Tannarxi: ${product.costPrice} ${product.currency}
Kategoriya: ${product.category}
Tavsif: ${product.description || "Yo'q"}
Rasm soni: ${(product.images as string[]).length}
Format: ${formatType}`;

    const raw = await generateText(system, userPrompt);

    let parsed: {
      title?: string;
      description?: string;
      tags?: string[];
      hashtags?: string[];
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Extract JSON from the response if wrapped in markdown
      const match = raw.match(/\{[\s\S]*\}/);
      try {
        parsed = match ? JSON.parse(match[0]) : {};
      } catch {
        parsed = {};
      }
    }

    res.json({
      title: (parsed.title ?? product.name).slice(0, 100),
      description: parsed.description ?? "",
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 30) : [],
      hashtags: Array.isArray(parsed.hashtags)
        ? parsed.hashtags.slice(0, 15)
        : [],
      isShort,
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /connectors/youtube/publish
// Build slideshow video from product images, upload to YouTube.
// ---------------------------------------------------------------------------
router.post(
  "/connectors/youtube/publish",
  handle(async (req, res) => {
    const firebaseUid = getProfileOr401(req, res);
    if (!firebaseUid) return;
    const userId = await getUserRowId(firebaseUid);
    if (!userId) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    const {
      accountId,
      productId,
      title,
      description,
      tags,
      hashtags,
      isShort,
      imageUrls: clientImageUrls,
    } = req.body as {
      accountId?: number;
      productId?: number;
      title?: string;
      description?: string;
      tags?: string[];
      hashtags?: string[];
      isShort?: boolean;
      // User-selected images from the Results screen; overrides product.images
      // when provided. Allows the seller to curate which photos go into the video.
      imageUrls?: string[];
    };

    if (!accountId || !productId || !title) {
      res
        .status(400)
        .json({ error: "accountId, productId va title majburiy." });
      return;
    }

    // Verify ownership of both the account and the product
    const [account] = await db
      .select()
      .from(youtubeAccountsTable)
      .where(
        and(
          eq(youtubeAccountsTable.id, accountId),
          eq(youtubeAccountsTable.userId, userId),
        ),
      )
      .limit(1);
    if (!account) {
      res.status(404).json({ error: "YouTube kanal topilmadi." });
      return;
    }

    const [product] = await db
      .select()
      .from(productsTable)
      .where(
        and(
          eq(productsTable.id, productId),
          eq(productsTable.userId, userId),
        ),
      )
      .limit(1);
    if (!product) {
      res.status(404).json({ error: "Mahsulot topilmadi." });
      return;
    }

    // Prefer user-selected images from the Results screen; fall back to all
    // product images when the client sends none.
    const images: string[] =
      clientImageUrls && clientImageUrls.length > 0
        ? clientImageUrls
        : (product.images as string[]) || [];

    if (images.length === 0) {
      res.status(400).json({
        error:
          "Rasm topilmadi. Inventory'ga rasm qo'shing yoki Results ekranida rasm tanlang.",
      });
      return;
    }

    const tmpDir = join(tmpdir(), `yt-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const videoPath = join(tmpDir, "video.mp4");

    try {
      // Refresh token if needed
      const accessToken = await ensureFreshToken(account);

      // Download images
      const imagePaths: string[] = [];
      for (let i = 0; i < Math.min(images.length, 8); i++) {
        const dest = join(tmpDir, `img${i}.jpg`);
        const ok = await downloadImage(images[i], dest);
        if (ok) imagePaths.push(dest);
      }

      if (imagePaths.length === 0) {
        res.status(400).json({
          error:
            "Rasmlarni yuklab bo'lmadi. Mahsulot rasmlarini tekshiring.",
        });
        return;
      }

      // Build the slideshow video
      console.log(`[youtube] ffmpeg slideshow: ${imagePaths.length} rasm → ${videoPath}`);
      await buildSlideshowVideo(imagePaths, videoPath, isShort ?? false);

      // Get file size for the resumable upload
      const { statSync } = await import("fs");
      const { size: fileSize } = statSync(videoPath);

      // Build the full description with hashtags appended
      const hashtagLine =
        (hashtags ?? []).map((t: string) => `#${t.replace(/^#/, "")}`).join(" ");
      const fullDescription = [description ?? "", hashtagLine]
        .filter(Boolean)
        .join("\n\n");

      // Upload to YouTube with up to 3 retries on transient errors
      let videoId: string | null = null;
      let lastUploadErr: unknown;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          videoId = await uploadToYouTube({
            accessToken,
            title: title.slice(0, 100),
            description: fullDescription,
            tags: tags ?? [],
            categoryId: "26", // Howto & Style
            isShort: isShort ?? false,
            videoPath,
            fileSize,
          });
          break;
        } catch (e) {
          lastUploadErr = e;
          const msg = String((e as Error).message ?? "");
          // Don't retry quota errors or auth errors
          if (/kvota|quota|401|403/i.test(msg)) throw e;
          if (attempt < 3) {
            console.warn(`[youtube] upload urinish ${attempt} muvaffaqiyatsiz, qayta urinamiz…`);
            await new Promise((r) => setTimeout(r, 2000 * attempt));
          }
        }
      }

      if (!videoId) throw lastUploadErr ?? new Error("YouTube yuklash muvaffaqiyatsiz");

      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Save to posts table for future analytics
      await db.insert(postsTable).values({
        userId,
        productId,
        name: product.name,
        price: product.sellPrice,
        category: product.category,
        status: "Published",
        // telegramChannelId and telegramMessageId are null — this is a YouTube post.
        telegramMessageId: null,
        platform: "youtube",
        platformPostId: videoId,
      });

      console.log(`[youtube] ✓ video yuklandi: ${videoUrl}`);
      res.json({ success: true, videoId, url: videoUrl });
    } finally {
      // Always clean up temp files regardless of success/failure
      rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }),
);

export default router;
