import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, productsTable, youtubeProductContentsTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import { createWriteStream, mkdirSync } from "fs";
import { readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { generateText } from "../ai/textProviders";

const execFileAsync = promisify(execFile);
const router = Router();
const DIRECTOR_VERSION = "v2";
const VIDEO_SECONDS = 5;
const TRANSITION_SECONDS = 0.22;

const MUSIC_STYLES: Record<string, { notes: number[] }> = {
  energetic: { notes: [220, 277.18, 329.63] },
  technology: { notes: [110, 138.59, 164.81] },
  luxury: { notes: [164.81, 207.65, 246.94] },
  beauty: { notes: [196, 246.94, 293.66] },
  sport: { notes: [130.81, 164.81, 196] },
  fashion: { notes: [174.61, 220, 261.63] },
  home: { notes: [146.83, 185, 220] },
  minimal: { notes: [174.61, 220, 261.63] },
};

function handle(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error("[youtube marketing route]", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Server xatosi" });
    }
  };
}

async function getUserRowId(firebaseUid: string) {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.firebaseUid, firebaseUid)).limit(1);
  return user?.id ?? null;
}

function getFirebaseUid(req: any, res: any): string | null {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return null;
  }
  return userId;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    try { return JSON.parse(match[0]) as T; } catch { return fallback; }
  }
}

function productHash(product: any, isShort: boolean) {
  return createHash("sha256").update(JSON.stringify({
    director: DIRECTOR_VERSION,
    isShort,
    id: product.id,
    name: product.name,
    category: product.category,
    description: product.description,
    characteristics: product.characteristics,
    images: product.images,
  })).digest("hex");
}

async function ensureDirectorTable() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS youtube_video_director_plans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    content_hash TEXT NOT NULL,
    is_short BOOLEAN NOT NULL DEFAULT FALSE,
    plan_json TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT youtube_video_director_unique UNIQUE (product_id, content_hash, is_short)
  )`);
}

async function downloadImage(url: string, dest: string) {
  try {
    if (url.startsWith("data:")) {
      const match = url.match(/^data:[^;]+;base64,(.+)$/s);
      if (!match) return false;
      await writeFile(dest, Buffer.from(match[1], "base64"));
      return true;
    }
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok || !response.body || !(response.headers.get("content-type") ?? "").startsWith("image/")) return false;
    await pipeline(Readable.fromWeb(response.body as any), createWriteStream(dest));
    return true;
  } catch {
    return false;
  }
}

interface ScenePlan {
  imageIndex: number;
  text: string;
  motion: "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
  transition: "fade" | "smoothleft" | "smoothright" | "wipeleft" | "wiperight" | "circleopen";
}

interface DirectorPlan {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  hook: string;
  cta: string;
  musicStyle: string;
  scenes: ScenePlan[];
}

function fallbackPlan(product: any, isShort: boolean): DirectorPlan {
  const category = String(product.category ?? "").toLowerCase();
  const musicStyle = category.includes("tech") || category.includes("elect") ? "technology" : category.includes("sport") ? "sport" : category.includes("beaut") ? "beauty" : category.includes("fashion") ? "fashion" : "minimal";
  const name = String(product.name ?? "Mahsulot");
  const description = String(product.description ?? "").trim();
  return {
    title: `${name} — foydali tanlov${isShort ? " #Shorts" : ""}`.slice(0, 100),
    description: `${name} haqida qisqa ko‘rib chiqish. ${description}`.trim(),
    tags: [name, String(product.category ?? "mahsulot"), "uzbekistan", "shopping"].slice(0, 10),
    hashtags: ["Shorts", "OneOfficeAI", String(product.category ?? "mahsulot").replace(/\s+/g, "")].slice(0, 5),
    hook: `Bu mahsulotning eng qiziq tomoni nima?`,
    cta: "Batafsil ko‘ring",
    musicStyle,
    scenes: [
      { imageIndex: 0, text: `Bu mahsulotni ko‘ring`, motion: "zoom-in", transition: "fade" },
      { imageIndex: 0, text: description.slice(0, 48), motion: "pan-right", transition: "smoothleft" },
      { imageIndex: 0, text: "Batafsil ko‘ring", motion: "zoom-out", transition: "fade" },
    ],
  };
}

async function createDirectorPlan(product: any, isShort: boolean): Promise<DirectorPlan> {
  const imageCount = Array.isArray(product.images) ? product.images.length : 0;
  const format = isShort ? "9:16 YouTube Short" : "16:9 YouTube video";
  const system = `Sen OneOfficeAI uchun professional video marketing direktorsan. Mahsulot haqidagi faktlarni marketing hikoyasiga aylantirasan. Maqsad — tomoshabinni videoning boshida qiziqtirish, keyin foydani ko‘rsatish va oxirida yumshoq CTA berish. Viral ko‘rishlarni kafolatlama. Hech qachon mahsulot haqida berilmagan fakt, chegirma, reyting, sertifikat, sharh yoki natijani o‘ylab topma. Mahsulot narxini videoda faqat foydali bo‘lsa ishlat. ${format} uchun atigi 5 soniyalik video reja tuz.

FAQAT JSON qaytar:
{"title":"","description":"","tags":[],"hashtags":[],"hook":"","cta":"","musicStyle":"","scenes":[{"imageIndex":0,"text":"","motion":"zoom-in","transition":"fade"},{"imageIndex":0,"text":"","motion":"pan-right","transition":"smoothleft"},{"imageIndex":0,"text":"","motion":"zoom-out","transition":"fade"}]}

Qoidalar:
- title <=100 belgi, qiziqarli va aniq; soxta clickbait emas.
- description tabiiy, foydaga yo‘naltirilgan, mahsulot tavsifini ko‘chirib qo‘ymaydi.
- tags 5-15 ta aniq qidiruv iborasi.
- hashtags 3-6 ta.
- hook juda qisqa, 2-7 so‘z.
- cta juda qisqa.
- scenes aynan 3 ta bo‘lsin.
- imageIndex 0..${Math.max(0, imageCount - 1)} oralig‘ida bo‘lsin; rasm kam bo‘lsa 0 ni qaytar.
- scene text 45 belgidan oshmasin.
- motion faqat zoom-in, zoom-out, pan-left, pan-right.
- transition faqat fade, smoothleft, smoothright, wipeleft, wiperight, circleopen.
- musicStyle faqat energetic, technology, luxury, beauty, sport, fashion, home, minimal.
`;
  const user = `Mahsulot nomi: ${product.name}
Kategoriya: ${product.category}
Tavsif: ${product.description || "Berilmagan"}
Xususiyatlar: ${JSON.stringify(product.characteristics ?? {})}
Rasm soni: ${imageCount}
Format: ${format}`;
  try {
    const raw = await generateText(system, user);
    const parsed = parseJson<Partial<DirectorPlan>>(raw, {});
    const fallback = fallbackPlan(product, isShort);
    const scenes = Array.isArray(parsed.scenes) && parsed.scenes.length >= 3 ? parsed.scenes.slice(0, 3) : fallback.scenes;
    return {
      ...fallback,
      ...parsed,
      title: String(parsed.title ?? fallback.title).slice(0, 100),
      description: String(parsed.description ?? fallback.description),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 15) : fallback.tags,
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map((x) => String(x).replace(/^#/, "")).slice(0, 6) : fallback.hashtags,
      hook: String(parsed.hook ?? fallback.hook).slice(0, 80),
      cta: String(parsed.cta ?? fallback.cta).slice(0, 50),
      musicStyle: MUSIC_STYLES[String(parsed.musicStyle ?? "").toLowerCase()] ? String(parsed.musicStyle).toLowerCase() : fallback.musicStyle,
      scenes: scenes.map((s: any, index: number) => ({
        imageIndex: Math.max(0, Math.min(imageCount - 1, Number(s.imageIndex ?? 0))),
        text: String(s.text ?? (index === 0 ? fallback.hook : index === 2 ? fallback.cta : "")).slice(0, 45),
        motion: ["zoom-in", "zoom-out", "pan-left", "pan-right"].includes(s.motion) ? s.motion : ["zoom-in", "pan-right", "zoom-out"][index],
        transition: ["fade", "smoothleft", "smoothright", "wipeleft", "wiperight", "circleopen"].includes(s.transition) ? s.transition : index === 1 ? "smoothleft" : "fade",
      })),
    };
  } catch (error) {
    console.warn("[youtube director] AI plan fallback:", error);
    return fallbackPlan(product, isShort);
  }
}

async function getOrCreatePlan(userId: number, product: any, isShort: boolean) {
  await ensureDirectorTable();
  const hash = productHash(product, isShort);
  const existing = await db.execute(sql`SELECT plan_json FROM youtube_video_director_plans WHERE product_id = ${product.id} AND content_hash = ${hash} AND is_short = ${isShort} LIMIT 1`);
  const row = (existing as any)?.rows?.[0] ?? (Array.isArray(existing) ? (existing as any)[0] : null);
  if (row?.plan_json) return { hash, plan: parseJson<DirectorPlan>(row.plan_json, fallbackPlan(product, isShort)) };
  const plan = await createDirectorPlan(product, isShort);
  await db.execute(sql`INSERT INTO youtube_video_director_plans (user_id, product_id, content_hash, is_short, plan_json, created_at, updated_at) VALUES (${userId}, ${product.id}, ${hash}, ${isShort}, ${JSON.stringify(plan)}, NOW(), NOW()) ON CONFLICT (product_id, content_hash, is_short) DO UPDATE SET plan_json = EXCLUDED.plan_json, updated_at = NOW()`);
  return { hash, plan };
}

function motionFilter(motion: ScenePlan["motion"], frames: number, w: number, h: number) {
  const base = `scale=${Math.round(w * 1.12)}:${Math.round(h * 1.12)}:force_original_aspect_ratio=increase,crop=${Math.round(w * 1.12)}:${Math.round(h * 1.12)}`;
  if (motion === "zoom-out") return `${base},zoompan=z='if(lte(zoom,1.0),1.12,max(1.0,zoom-0.0008))':d=${frames}:s=${w}x${h}:fps=30`;
  if (motion === "pan-left") return `${base},zoompan=z='1.08':x='min(iw-iw/zoom,max(0,(iw-iw/zoom)*on/${frames}))':y='(ih-ih/zoom)/2':d=${frames}:s=${w}x${h}:fps=30`;
  if (motion === "pan-right") return `${base},zoompan=z='1.08':x='max(0,(iw-iw/zoom)*(1-on/${frames}))':y='(ih-ih/zoom)/2':d=${frames}:s=${w}x${h}:fps=30`;
  return `${base},zoompan=z='min(1.12,1+0.0008*on)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${frames}:s=${w}x${h}:fps=30`;
}

async function buildMusic(style: string, outputPath: string) {
  const notes = MUSIC_STYLES[style]?.notes ?? MUSIC_STYLES.minimal.notes;
  const inputs = notes.flatMap((note) => ["-f", "lavfi", "-i", `sine=frequency=${note}:duration=${VIDEO_SECONDS}`]);
  const filter = notes.map((_, i) => `[${i}:a]volume=${[0.42, 0.28, 0.2][i]}[m${i}]`).join(";") + `;${notes.map((_, i) => `[m${i}]`).join("")}amix=inputs=${notes.length}:duration=longest:normalize=1,afade=t=in:st=0:d=0.35,afade=t=out:st=4.35:d=0.65,lowpass=f=5200,volume=0.65`;
  await execFileAsync("ffmpeg", [...inputs, "-filter_complex", filter, "-c:a", "libmp3lame", "-b:a", "96k", "-y", outputPath], { timeout: 30000 });
}

async function buildMarketingVideo(imagePaths: string[], plan: DirectorPlan, outputPath: string, isShort: boolean, tmpDir: string) {
  const [w, h] = isShort ? [1080, 1920] : [1920, 1080];
  const sceneCount = Math.max(1, Math.min(3, plan.scenes.length));
  const sceneDuration = (VIDEO_SECONDS + (sceneCount - 1) * TRANSITION_SECONDS) / sceneCount;
  const frames = Math.round(sceneDuration * 30);
  const inputs: string[] = [];
  const filters: string[] = [];
  const sceneLabels: string[] = [];

  for (let i = 0; i < sceneCount; i++) {
    const scene = plan.scenes[i];
    const image = imagePaths[Math.max(0, Math.min(imagePaths.length - 1, scene.imageIndex))] ?? imagePaths[0];
    const textPath = join(tmpDir, `scene-${i}.txt`);
    await writeFile(textPath, scene.text || "", "utf8");
    inputs.push("-loop", "1", "-t", sceneDuration.toFixed(3), "-i", image);
    const motion = motionFilter(scene.motion, frames, w, h);
    const safeText = `drawtext=textfile='${textPath}':fontfile='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf':fontcolor=white:fontsize=${Math.round(w * 0.045)}:line_spacing=8:box=1:boxcolor=black@0.42:boxborderw=${Math.round(w * 0.02)}:x=(w-text_w)/2:y=h*0.76`;
    filters.push(`[${i}:v]${motion},${safeText},format=yuv420p,settb=AVTB,setsar=1[v${i}]`);
    sceneLabels.push(`[v${i}]`);
  }

  let current = sceneLabels[0];
  let currentDuration = sceneDuration;
  for (let i = 1; i < sceneCount; i++) {
    const out = `[x${i}]`;
    const offset = currentDuration - TRANSITION_SECONDS;
    filters.push(`${current}[v${i}]xfade=transition=${plan.scenes[i].transition}:duration=${TRANSITION_SECONDS}:offset=${offset.toFixed(3)}${out}`);
    current = out;
    currentDuration = currentDuration + sceneDuration - TRANSITION_SECONDS;
  }

  const musicPath = join(tmpDir, "music.mp3");
  await buildMusic(plan.musicStyle, musicPath);
  const videoFilter = filters.join(";");
  const args = [
    ...inputs,
    "-i", musicPath,
    "-filter_complex", videoFilter,
    "-map", current,
    "-map", `${sceneCount}:a`,
    "-t", String(VIDEO_SECONDS),
    "-r", "30",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "22",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-af", "volume=0.7,afade=t=in:st=0:d=0.2,afade=t=out:st=4.5:d=0.5",
    "-movflags", "+faststart",
    "-y", outputPath,
  ];
  await execFileAsync("ffmpeg", args, { timeout: 120000 });
}

function cacheArrays(value: unknown) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

async function renderForProduct(userId: number, product: any, isShort: boolean, imageUrls?: string[]) {
  const { hash, plan } = await getOrCreatePlan(userId, product, isShort);
  await ensureDirectorTable();
  const images = (imageUrls?.length ? imageUrls : (Array.isArray(product.images) ? product.images : [])) as string[];
  if (!images.length) throw new Error("Mahsulot rasmi topilmadi.");

  const existing = await db.select().from(youtubeProductContentsTable).where(and(eq(youtubeProductContentsTable.productId, product.id), eq(youtubeProductContentsTable.contentHash, hash), eq(youtubeProductContentsTable.isShort, isShort))).limit(1);
  let cached = existing[0];
  if (cached?.videoData) return { plan, hash, videoData: cached.videoData };

  const tmpDir = join(tmpdir(), `oneoffice-yt-director-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  try {
    const imagePaths: string[] = [];
    for (let i = 0; i < Math.min(images.length, 4); i++) {
      const path = join(tmpDir, `image-${i}.jpg`);
      if (await downloadImage(images[i], path)) imagePaths.push(path);
    }
    if (!imagePaths.length) throw new Error("Mahsulot rasmlarini yuklab bo'lmadi.");
    const videoPath = join(tmpDir, "video.mp4");
    await buildMarketingVideo(imagePaths, plan, videoPath, isShort, tmpDir);
    const videoData = (await readFile(videoPath)).toString("base64");
    if (cached) {
      await db.update(youtubeProductContentsTable).set({ title: plan.title, description: plan.description, tags: cacheArrays(plan.tags), hashtags: cacheArrays(plan.hashtags), videoData, updatedAt: new Date() }).where(eq(youtubeProductContentsTable.id, cached.id));
    } else {
      [cached] = await db.insert(youtubeProductContentsTable).values({ userId, productId: product.id, contentHash: hash, isShort, title: plan.title, description: plan.description, tags: cacheArrays(plan.tags), hashtags: cacheArrays(plan.hashtags), videoData, createdAt: new Date(), updatedAt: new Date() }).returning();
    }
    return { plan, hash, videoData };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

router.post("/connectors/youtube/marketing-plan", handle(async (req, res) => {
  const uid = getFirebaseUid(req, res); if (!uid) return;
  const userId = await getUserRowId(uid); if (!userId) { res.status(404).json({ error: "Profil hali sozlanmagan." }); return; }
  const productId = Number(req.body?.productId);
  const isShort = Boolean(req.body?.isShort);
  if (!Number.isFinite(productId)) { res.status(400).json({ error: "productId majburiy." }); return; }
  const [product] = await db.select().from(productsTable).where(and(eq(productsTable.id, productId), eq(productsTable.userId, userId))).limit(1);
  if (!product) { res.status(404).json({ error: "Mahsulot topilmadi." }); return; }
  const { plan, hash } = await getOrCreatePlan(userId, product, isShort);
  res.json({ ...plan, contentHash: hash, directorVersion: DIRECTOR_VERSION });
}));

router.post("/connectors/youtube/metadata", handle(async (req, res) => {
  const uid = getFirebaseUid(req, res); if (!uid) return;
  const userId = await getUserRowId(uid); if (!userId) { res.status(404).json({ error: "Profil hali sozlanmagan." }); return; }
  const productId = Number(req.body?.productId);
  const isShort = Boolean(req.body?.isShort);
  if (!Number.isFinite(productId)) { res.status(400).json({ error: "productId majburiy." }); return; }
  const [product] = await db.select().from(productsTable).where(and(eq(productsTable.id, productId), eq(productsTable.userId, userId))).limit(1);
  if (!product) { res.status(404).json({ error: "Mahsulot topilmadi." }); return; }
  const { plan } = await getOrCreatePlan(userId, product, isShort);
  res.json({ title: plan.title, description: plan.description, tags: plan.tags, hashtags: plan.hashtags, hook: plan.hook, cta: plan.cta, musicStyle: plan.musicStyle, scenes: plan.scenes, isShort, cached: false, videoCached: false });
}));

router.get("/connectors/youtube/preview", handle(async (req, res) => {
  const uid = getFirebaseUid(req, res); if (!uid) return;
  const userId = await getUserRowId(uid); if (!userId) { res.status(404).json({ error: "Profil hali sozlanmagan." }); return; }
  const productId = Number(req.query.productId);
  const isShort = String(req.query.isShort ?? "false") === "true";
  if (!Number.isFinite(productId)) { res.status(400).json({ error: "productId majburiy." }); return; }
  const [product] = await db.select().from(productsTable).where(and(eq(productsTable.id, productId), eq(productsTable.userId, userId))).limit(1);
  if (!product) { res.status(404).json({ error: "Mahsulot topilmadi." }); return; }
  const result = await renderForProduct(userId, product, isShort);
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", "inline; filename=oneoffice-youtube-marketing-preview.mp4");
  res.setHeader("Cache-Control", "private, no-store");
  res.send(Buffer.from(result.videoData, "base64"));
}));

export default router;
