import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, youtubeAccountsTable, productsTable, postsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { createReadStream, mkdirSync, statSync } from "fs";
import { readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";

const router = Router();

function handle(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try { await fn(req, res); }
    catch (err) {
      console.error("[youtube marketing publish]", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Server xatosi" });
    }
  };
}

async function getUserRowId(firebaseUid: string) {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.firebaseUid, firebaseUid)).limit(1);
  return user?.id ?? null;
}

function auth(req: any, res: any) {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Tizimga kirilmagan." }); return null; }
  return userId;
}

function googleClientId() {
  return (process.env.GOOGLE_CLIENT_ID ?? "").replace(/^https?:\/\//, "").trim();
}

async function freshToken(account: any) {
  if (Date.now() + 5 * 60 * 1000 < (account.tokenExpiresAt?.getTime() ?? 0)) return account.accessToken;
  if (!account.refreshToken) throw new Error("YouTube token eskirdi. Kanalni qayta ulang.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: account.refreshToken, client_id: googleClientId(), client_secret: process.env.GOOGLE_CLIENT_SECRET! }),
  });
  const data = await response.json() as any;
  if (!response.ok || !data.access_token) throw new Error(`Token yangilash muvaffaqiyatsiz: ${data.error_description ?? data.error ?? response.status}`);
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
  await db.update(youtubeAccountsTable).set({ accessToken: data.access_token, tokenExpiresAt: expiresAt }).where(eq(youtubeAccountsTable.id, account.id));
  return data.access_token;
}

async function upload(accessToken: string, title: string, description: string, tags: string[], videoPath: string, size: number) {
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(size),
    },
    body: JSON.stringify({
      snippet: { title: title.slice(0, 100), description, tags: tags.slice(0, 30), categoryId: "26" },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    }),
  });
  if (!init.ok) {
    const error = await init.json().catch(() => ({})) as any;
    const reason = error?.error?.errors?.[0]?.reason ?? "";
    if (reason === "quotaExceeded") throw new Error("YouTube kunlik kvota tugadi. Keyinroq qayta urinib ko'ring.");
    throw new Error(`YouTube upload boshlanmadi: ${error?.error?.message ?? init.status}`);
  }
  const location = init.headers.get("Location");
  if (!location) throw new Error("YouTube upload URL topilmadi.");
  const stream = createReadStream(videoPath);
  const response = await fetch(location, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(size) },
    body: Readable.toWeb(stream) as any,
    duplex: "half" as any,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as any;
    throw new Error(`YouTube video yuklanmadi: ${error?.error?.message ?? response.status}`);
  }
  const data = await response.json() as { id?: string };
  if (!data.id) throw new Error("YouTube video ID qaytarilmadi.");
  return data.id;
}

router.post("/connectors/youtube/publish", handle(async (req, res) => {
  const firebaseUid = auth(req, res); if (!firebaseUid) return;
  const userId = await getUserRowId(firebaseUid); if (!userId) { res.status(404).json({ error: "Profil hali sozlanmagan." }); return; }
  const body = req.body as { accountId?: number; productId?: number; title?: string; description?: string; tags?: string[]; hashtags?: string[]; isShort?: boolean };
  if (!body.accountId || !body.productId || !body.title) { res.status(400).json({ error: "accountId, productId va title majburiy." }); return; }

  const [account] = await db.select().from(youtubeAccountsTable).where(and(eq(youtubeAccountsTable.id, body.accountId), eq(youtubeAccountsTable.userId, userId))).limit(1);
  if (!account) { res.status(404).json({ error: "YouTube kanal topilmadi." }); return; }
  const [product] = await db.select().from(productsTable).where(and(eq(productsTable.id, body.productId), eq(productsTable.userId, userId))).limit(1);
  if (!product) { res.status(404).json({ error: "Mahsulot topilmadi." }); return; }

  const tmpDir = join(tmpdir(), `oneoffice-yt-publish-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  const videoPath = join(tmpDir, "video.mp4");
  try {
    // Generate exactly the same AI-directed video as the preview endpoint.
    // Calling the local route keeps one renderer/cache implementation instead
    // of maintaining a second, subtly different publishing renderer.
    const port = Number(process.env.PORT ?? 5000);
    const previewUrl = `http://127.0.0.1:${port}/api/connectors/youtube/preview?productId=${encodeURIComponent(body.productId)}&isShort=${Boolean(body.isShort)}`;
    const authHeader = req.headers.authorization;
    const preview = await fetch(previewUrl, { headers: authHeader ? { Authorization: authHeader } : {}, signal: AbortSignal.timeout(180000) });
    if (!preview.ok) {
      const error = await preview.json().catch(() => ({})) as any;
      throw new Error(error?.error ?? `Video preview/generation failed: ${preview.status}`);
    }
    await writeFile(videoPath, Buffer.from(await preview.arrayBuffer()));

    const accessToken = await freshToken(account);
    const size = statSync(videoPath).size;
    const hashtags = (body.hashtags ?? []).map((x) => `#${String(x).replace(/^#/, "")}`).join(" ");
    const description = [body.description ?? "", hashtags].filter(Boolean).join("\n\n");
    const videoId = await upload(accessToken, body.title, description, body.tags ?? [], videoPath, size);

    await db.insert(postsTable).values({
      userId,
      productId: body.productId,
      name: product.name,
      price: product.sellPrice,
      category: product.category,
      status: "Published",
      telegramMessageId: null,
      platform: "youtube",
      platformPostId: videoId,
    });

    res.json({ success: true, videoId, url: `https://www.youtube.com/watch?v=${videoId}`, durationSeconds: 5, renderer: "ai-director-v2" });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}));

export default router;
