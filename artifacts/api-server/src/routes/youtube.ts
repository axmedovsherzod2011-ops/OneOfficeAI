import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, youtubeAccountsTable, productsTable, postsTable, MAX_YOUTUBE_ACCOUNTS_PER_USER, youtubeProductContentsTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import { createReadStream, createWriteStream, mkdirSync, statSync } from "fs";
import { readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { generateText } from "../ai/textProviders";

const execFileAsync = promisify(execFile);
const router = Router();

function handle(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try { await fn(req, res); }
    catch (err) {
      console.error("[youtube route]", err);
      const message = err instanceof Error ? err.message : "Server xatosi";
      res.status(500).json({ error: message });
    }
  };
}

async function getUserRowId(firebaseUid: string) {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.firebaseUid, firebaseUid)).limit(1);
  return user?.id ?? null;
}

function getProfileOr401(req: any, res: any): string | null {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Tizimga kirilmagan." }); return null; }
  return userId;
}

function toAccountResponse(a: typeof youtubeAccountsTable.$inferSelect) {
  return { id: a.id, channelId: a.channelId, title: a.title, customUrl: a.customUrl, thumbnailUrl: a.thumbnailUrl };
}

function getGoogleClientId() { return (process.env.GOOGLE_CLIENT_ID ?? "").replace(/^https?:\/\//, "").trim(); }

function getRedirectUri() {
  const raw = (process.env.PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return raw ? `${raw.startsWith("http") ? raw : `https://${raw}`}/` : "";
}

async function ensureFreshToken(account: typeof youtubeAccountsTable.$inferSelect) {
  const expiresAt = account.tokenExpiresAt?.getTime() ?? 0;
  if (Date.now() + 5 * 60 * 1000 < expiresAt) return account.accessToken;
  if (!account.refreshToken) throw new Error("YouTube token eskirdi. Kanalni qayta ulang.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: account.refreshToken, client_id: getGoogleClientId(), client_secret: process.env.GOOGLE_CLIENT_SECRET! }),
  });
  const data = await res.json() as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(`Token yangilash muvaffaqiyatsiz: ${data.error_description ?? data.error ?? res.status}`);
  const tokenExpiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
  await db.update(youtubeAccountsTable).set({ accessToken: data.access_token, tokenExpiresAt }).where(eq(youtubeAccountsTable.id, account.id));
  return data.access_token;
}

async function downloadImage(url: string, dest: string) {
  try {
    if (url.startsWith("data:")) {
      const match = url.match(/^data:[^;]+;base64,(.+)$/s);
      if (!match) return false;
      await writeFile(dest, Buffer.from(match[1], "base64"));
      return true;
    }
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").startsWith("image/")) return false;
    await pipeline(Readable.fromWeb(res.body as any), createWriteStream(dest));
    return true;
  } catch { return false; }
}

async function buildFiveSecondVideo(imagePath: string, outputPath: string, isShort: boolean) {
  const [w, h] = isShort ? [1080, 1920] : [1920, 1080];
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`;
  const args = ["-loop", "1", "-i", imagePath, "-t", "5", "-vf", vf, "-r", "30", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-an", "-movflags", "+faststart", "-y", outputPath];
  await execFileAsync("ffmpeg", args, { timeout: 45_000 });
}

async function uploadToYouTube(opts: { accessToken: string; title: string; description: string; tags: string[]; videoPath: string; fileSize: number }) {
  const body = JSON.stringify({ snippet: { title: opts.title.slice(0, 100), description: opts.description, tags: opts.tags.slice(0, 30), categoryId: "26" }, status: { privacyStatus: "public", selfDeclaredMadeForKids: false } });
  const initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST", headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(opts.fileSize) }, body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({})) as any;
    const reason = err?.error?.errors?.[0]?.reason ?? "";
    if (reason === "quotaExceeded") throw new Error("YouTube kunlik kvota tugadi. Keyinroq qayta urinib ko'ring.");
    throw new Error(`YouTube upload boshlanmadi: ${err?.error?.message ?? initRes.status}`);
  }
  const uploadUrl = initRes.headers.get("Location");
  if (!uploadUrl) throw new Error("YouTube upload URL topilmadi.");
  const uploadRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(opts.fileSize) }, body: Readable.toWeb(createReadStream(opts.videoPath)) as any, duplex: "half" as any, signal: AbortSignal.timeout(120_000) });
  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({})) as any;
    throw new Error(`YouTube video yuklanmadi: ${err?.error?.message ?? uploadRes.status}`);
  }
  const data = await uploadRes.json() as { id?: string };
  if (!data.id) throw new Error("YouTube video ID qaytarilmadi.");
  return data.id;
}

let youtubeCacheReady: Promise<void> | null = null;
function ensureYoutubeCacheTable() {
  if (!youtubeCacheReady) {
    youtubeCacheReady = (async () => {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS youtube_product_contents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        content_hash TEXT NOT NULL,
        is_short BOOLEAN NOT NULL DEFAULT FALSE,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        hashtags TEXT NOT NULL DEFAULT '[]',
        video_data TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT youtube_product_contents_version_unique UNIQUE (product_id, content_hash, is_short)
      )`);
    })().catch((err) => { youtubeCacheReady = null; throw err; });
  }
  return youtubeCacheReady;
}

function productContentHash(product: any): string {
  const content = { name: product.name, category: product.category, costPrice: product.costPrice, sellPrice: product.sellPrice, currency: product.currency, description: product.description, images: product.images, characteristics: product.characteristics, deliveryInfo: product.deliveryInfo };
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

function parseCachedArray(value: string): string[] { try { return JSON.parse(value); } catch { return []; } }

router.get("/connectors/youtube/config", (_req, res) => {
  const clientId = getGoogleClientId();
  res.json({ clientId, redirectUri: getRedirectUri() || null, scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly", configured: Boolean(clientId && process.env.GOOGLE_CLIENT_SECRET) });
});

router.get("/connectors/youtube", handle(async (req, res) => {
  const firebaseUid = getProfileOr401(req, res); if (!firebaseUid) return;
  const userId = await getUserRowId(firebaseUid); if (!userId) { res.status(404).json({ error: "Profil hali sozlanmagan." }); return; }
  const accounts = await db.select().from(youtubeAccountsTable).where(eq(youtubeAccountsTable.userId, userId));
  res.json(accounts.map(toAccountResponse));
}));

router.get("/connectors/youtube/preview", handle(async (req, res) => {
  const firebaseUid = getProfileOr401(req, res); if (!firebaseUid) return;
  const userId = await getUserRowId(firebaseUid); if (!userId) { res.status(404).json({ error: "Profil hali sozlanmagan." }); return; }
  const productId = Number(req.query.productId);
  const isShort = String(req.query.isShort ?? "false") === "true";
  if (!Number.isFinite(productId)) { res.status(400).json({ error: "productId majburiy." }); return; }
  const [product] = await db.select().from(productsTable).where(and(eq(productsTable.id, productId), eq(productsTable.userId, userId))).limit(1);
  if (!product) { res.status(404).json({ error: "Mahsulot topilmadi." }); return; }
  await ensureYoutubeCacheTable();
  const contentHash = productContentHash(product);
  let [cached] = await db.select().from(youtubeProductContentsTable).where(and(eq(youtubeProductContentsTable.productId, productId), eq(youtubeProductContentsTable.contentHash, contentHash), eq(youtubeProductContentsTable.isShort, isShort))).limit(1);
  if (!cached?.videoData) {
    const images = (product.images as string[]) || [];
    if (!images.length) { res.status(400).json({ error: "Mahsulot rasmi topilmadi." }); return; }
    const tmpDir = join(tmpdir(), `yt-preview-${Date.now()}`); mkdirSync(tmpDir, { recursive: true });
    const videoPath = join(tmpDir, "video.mp4");
    try {
      const imagePath = join(tmpDir, "product.jpg");
      if (!(await downloadImage(images[0], imagePath))) { res.status(400).json({ error: "Mahsulot rasmini yuklab bo'lmadi." }); return; }
      await buildFiveSecondVideo(imagePath, videoPath, isShort);
      const videoData = (await readFile(videoPath)).toString("base64");
      if (cached) {
        await db.update(youtubeProductContentsTable).set({ videoData, updatedAt: new Date() }).where(eq(youtubeProductContentsTable.id, cached.id));
      } else {
        [cached] = await db.insert(youtubeProductContentsTable).values({ userId, productId, contentHash, isShort, title: product.name.slice(0, 100), description: "", tags: "[]", hashtags: "[]", videoData, createdAt: new Date(), updatedAt: new Date() }).returning();
      }
    } finally { await rm(tmpDir, { recursive: true, force: true }).catch(() => {}); }
  }
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", "inline; filename=oneoffice-youtube-preview.mp4");
  res.setHeader("Cache-Control", "private, no-store");
  res.send(Buffer.from(cached!.videoData!, "base64"));
}));

router.post("/connectors/youtube/exchange", handle(async (req, res) => {
  const firebaseUid = getProfileOr401(req, res); if (!firebaseUid) return;
  const userId = await getUserRowId(firebaseUid); if (!userId) { res.status(404).json({ error: "Profil hali sozlanmagan." }); return; }
  const clientId = getGoogleClientId(), clientSecret = process.env.GOOGLE_CLIENT_SECRET, redirectUri = getRedirectUri();
  if (!clientId || !clientSecret || !redirectUri) { res.status(400).json({ error: "YouTube OAuth server sozlamalari to'liq emas." }); return; }
  const { code } = req.body as { code?: string };
  if (!code) { res.status(400).json({ error: "OAuth code topilmadi." }); return; }
  const existing = await db.select({ id: youtubeAccountsTable.id }).from(youtubeAccountsTable).where(eq(youtubeAccountsTable.userId, userId));
  if (existing.length >= MAX_YOUTUBE_ACCOUNTS_PER_USER) { res.status(400).json({ error: `Siz eng ko'pi bilan ${MAX_YOUTUBE_ACCOUNTS_PER_USER} ta YouTube kanal ulashingiz mumkin.` }); return; }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
  const tokenData = await tokenRes.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!tokenRes.ok || !tokenData.access_token) { console.error("[youtube oauth]", { status: tokenRes.status, error: tokenData.error }); res.status(400).json({ error: tokenData.error_description ?? tokenData.error ?? "Google token olishda xato." }); return; }
  const accessToken = tokenData.access_token;
  const channelRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${accessToken}` } });
  const channelData = await channelRes.json() as any;
  if (!channelRes.ok) throw new Error(`YouTube kanalini olishda xato: ${channelData?.error?.message ?? channelRes.status}`);
  const ch = channelData.items?.[0]; if (!ch?.id) throw new Error("YouTube kanali topilmadi.");
  const [already] = await db.select().from(youtubeAccountsTable).where(and(eq(youtubeAccountsTable.userId, userId), eq(youtubeAccountsTable.channelId, ch.id))).limit(1);
  const values = { userId, channelId: ch.id, title: ch.snippet?.title ?? "", customUrl: ch.snippet?.customUrl ?? "", thumbnailUrl: ch.snippet?.thumbnails?.default?.url ?? "", accessToken, refreshToken: tokenData.refresh_token ?? already?.refreshToken ?? null, tokenExpiresAt: new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000) };
  let saved; if (already) [saved] = await db.update(youtubeAccountsTable).set(values).where(eq(youtubeAccountsTable.id, already.id)).returning(); else [saved] = await db.insert(youtubeAccountsTable).values(values).returning();
  if (!saved) throw new Error("YouTube kanalini saqlash muvaffaqiyatsiz.");
  res.json(toAccountResponse(saved));
}));

router.delete("/connectors/youtube/:id", handle(async (req, res) => {
  const firebaseUid = getProfileOr401(req, res); if (!firebaseUid) return;
  const userId = await getUserRowId(firebaseUid); if (!userId) { res.status(404).json({ error: "Profil hali sozlanmagan." }); return; }
  const id = Number(req.params.id); if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid account id" }); return; }
  const deleted = await db.delete(youtubeAccountsTable).where(and(eq(youtubeAccountsTable.id, id), eq(youtubeAccountsTable.userId, userId))).returning({ id: youtubeAccountsTable.id });
  if (!deleted.length) { res.status(404).json({ error: "Account not found" }); return; }
  res.status(204).end();
}));

router.post("/connectors/youtube/metadata", handle(async (req, res) => {
  const firebaseUid = getProfileOr401(req, res); if (!firebaseUid) return;
  const userId = await getUserRowId(firebaseUid); if (!userId) { res.status(404).json({ error: "Profil hali sozlanmagan." }); return; }
  const { productId, isShort = false } = req.body as { productId?: number; isShort?: boolean };
  if (!productId) { res.status(400).json({ error: "productId majburiy." }); return; }
  const [product] = await db.select().from(productsTable).where(and(eq(productsTable.id, productId), eq(productsTable.userId, userId))).limit(1);
  if (!product) { res.status(404).json({ error: "Mahsulot topilmadi." }); return; }
  await ensureYoutubeCacheTable();
  const contentHash = productContentHash(product);
  const [cached] = await db.select().from(youtubeProductContentsTable).where(and(eq(youtubeProductContentsTable.productId, productId), eq(youtubeProductContentsTable.contentHash, contentHash), eq(youtubeProductContentsTable.isShort, Boolean(isShort)))).limit(1);
  if (cached) return res.json({ title: cached.title, description: cached.description, tags: parseCachedArray(cached.tags), hashtags: parseCachedArray(cached.hashtags), isShort: Boolean(isShort), cached: true, videoCached: Boolean(cached.videoData) });
  const system = `Sen professional YouTube SEO marketologisan. Mahsulot uchun sotuvga yo'naltirilgan, tabiiy va professional metadata yarat. FAQAT JSON qaytar: {"title":"...","description":"...","tags":["..."],"hashtags":["..."]}. title <=100 belgi. description 150-300 so'z, hook + foydalar + muhim detallar + CTA. tags 10-20 ta, jami <=500 belgi. hashtags 5-10 ta. O'zbek auditoriyasi uchun yoz, kerak bo'lsa ruscha qidiruv kalitlarini tabiiy qo'sh.`;
  const prompt = `Mahsulot: ${product.name}\nNarx: ${product.sellPrice} ${product.currency}\nKategoriya: ${product.category}\nTavsif: ${product.description || "Yo'q"}\nFormat: ${isShort ? "5 soniyalik YouTube Short" : "5 soniyalik YouTube video"}`;
  const raw = await generateText(system, prompt);
  let parsed: any = {};
  try { parsed = JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch {} } }
  const title = String(parsed.title ?? product.name).slice(0, 100);
  const description = String(parsed.description ?? `Siz izlayotgan ${product.name} haqida qisqa va foydali ma'lumot. Buyurtma uchun OneOfficeAI orqali mahsulotni ko'ring.`);
  const tags = Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 30) : [];
  const hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags.map((x: string) => String(x).replace(/^#/, "")).slice(0, 10) : [];
  await db.insert(youtubeProductContentsTable).values({ userId, productId, contentHash, isShort: Boolean(isShort), title, description, tags: JSON.stringify(tags), hashtags: JSON.stringify(hashtags) });
  res.json({ title, description, tags, hashtags, isShort: Boolean(isShort), cached: false, videoCached: false });
}));

router.post("/connectors/youtube/publish", handle(async (req, res) => {
  const firebaseUid = getProfileOr401(req, res); if (!firebaseUid) return;
  const userId = await getUserRowId(firebaseUid); if (!userId) { res.status(404).json({ error: "Profil hali sozlanmagan." }); return; }
  const body = req.body as { accountId?: number; productId?: number; title?: string; description?: string; tags?: string[]; hashtags?: string[]; isShort?: boolean; imageUrls?: string[] };
  if (!body.accountId || !body.productId || !body.title) { res.status(400).json({ error: "accountId, productId va title majburiy." }); return; }
  const [account] = await db.select().from(youtubeAccountsTable).where(and(eq(youtubeAccountsTable.id, body.accountId), eq(youtubeAccountsTable.userId, userId))).limit(1);
  if (!account) { res.status(404).json({ error: "YouTube kanal topilmadi." }); return; }
  const [product] = await db.select().from(productsTable).where(and(eq(productsTable.id, body.productId), eq(productsTable.userId, userId))).limit(1);
  if (!product) { res.status(404).json({ error: "Mahsulot topilmadi." }); return; }
  const images = body.imageUrls?.length ? body.imageUrls : ((product.images as string[]) || []);
  if (!images.length) { res.status(400).json({ error: "Mahsulot rasmi topilmadi." }); return; }
  await ensureYoutubeCacheTable();
  const contentHash = productContentHash(product);
  const isShort = Boolean(body.isShort);
  let [cached] = await db.select().from(youtubeProductContentsTable).where(and(eq(youtubeProductContentsTable.productId, body.productId), eq(youtubeProductContentsTable.contentHash, contentHash), eq(youtubeProductContentsTable.isShort, isShort))).limit(1);
  const tmpDir = join(tmpdir(), `yt-${Date.now()}`); mkdirSync(tmpDir, { recursive: true });
  const videoPath = join(tmpDir, "video.mp4");
  try {
    const accessToken = await ensureFreshToken(account);
    if (cached?.videoData) await writeFile(videoPath, Buffer.from(cached.videoData, "base64"));
    else {
      const imagePath = join(tmpDir, "product.jpg");
      if (!(await downloadImage(images[0], imagePath))) { res.status(400).json({ error: "Mahsulot rasmini yuklab bo'lmadi." }); return; }
      await buildFiveSecondVideo(imagePath, videoPath, isShort);
    }
    const fileSize = statSync(videoPath).size;
    const hashtagLine = (body.hashtags ?? []).map((x) => `#${String(x).replace(/^#/, "")}`).join(" ");
    const description = [body.description ?? "", hashtagLine].filter(Boolean).join("\n\n");
    const videoId = await uploadToYouTube({ accessToken, title: body.title, description, tags: body.tags ?? [], videoPath, fileSize });
    const videoData = cached?.videoData ?? (await readFile(videoPath)).toString("base64");
    const cacheValues = { userId, productId: body.productId, contentHash, isShort, title: body.title.slice(0, 100), description: body.description ?? "", tags: JSON.stringify(body.tags ?? []), hashtags: JSON.stringify(body.hashtags ?? []), videoData, updatedAt: new Date() };
    if (cached) await db.update(youtubeProductContentsTable).set(cacheValues).where(eq(youtubeProductContentsTable.id, cached.id));
    else [cached] = await db.insert(youtubeProductContentsTable).values({ ...cacheValues, createdAt: new Date() }).returning();
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    await db.insert(postsTable).values({ userId, productId: body.productId, name: product.name, price: product.sellPrice, category: product.category, status: "Published", telegramMessageId: null, platform: "youtube", platformPostId: videoId });
    res.json({ success: true, videoId, url: videoUrl, durationSeconds: 5, cachedVideo: Boolean(cached?.videoData) });
  } finally { await rm(tmpDir, { recursive: true, force: true }).catch(() => {}); }
}));

export default router;