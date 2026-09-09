import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { EdgeTTS } from "node-edge-tts";

const execFileAsync = promisify(execFile);
export const VIDEO_DURATION_SECONDS = 15;

const TRANSITIONS = ["fade", "wipeleft", "slideright", "circleopen", "slideup", "slidedown"];
const BOLD_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function money(product: any) {
  const price = product?.sellPrice ?? product?.price;
  const currency = clean(product?.currency) || "UZS";
  return price !== undefined && price !== null && String(price).trim() ? `${price} ${currency}` : "";
}

function narration(product: any) {
  const name = clean(product?.name);
  const category = clean(product?.category);
  const description = clean(product?.description);
  const price = money(product);
  const desc = description.split(/[.!?]/).map(clean).filter(Boolean).slice(0, 2).join(". ");
  const parts = [
    name ? `${name} bilan tanishing.` : "Mahsulot bilan tanishing.",
    category ? `Bu ${category} toifasidagi amaliy va qulay mahsulot.` : "Bu amaliy va qulay mahsulot.",
    desc,
    "Mahsulotning ko‘rinishi, asosiy xususiyatlari va afzalliklarini ko‘rib chiqing.",
    "Kundalik foydalanish uchun qulay tanlov.",
    "Buyurtma berish uchun mahsulotni tanlang.",
    price ? `Mahsulot narxi ${price}.` : "Narx mahsulot sahifasida ko‘rsatilgan.",
  ].filter(Boolean).join(" ");
  return parts.slice(0, 620);
}

function drawEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, " ");
}

type Cue = { text: string; start: number; end: number };
function twoWordCues(raw: Array<{ part?: string; start?: number; end?: number }>): Cue[] {
  const words = raw
    .map(x => ({ text: clean(x.part), start: Number(x.start), end: Number(x.end) }))
    .filter(x => x.text && Number.isFinite(x.start) && Number.isFinite(x.end) && x.end >= x.start);
  const cues: Cue[] = [];
  for (let i = 0; i < words.length; i += 2) {
    const a = words[i];
    const b = words[i + 1];
    cues.push({ text: [a.text, b?.text].filter(Boolean).join(" ").slice(0, 70), start: a.start / 1000, end: (b?.end ?? a.end) / 1000 });
  }
  return cues.filter(x => x.start < 15 && x.end > 0);
}

async function makeMusicWav(outputPath: string) {
  const sampleRate = 44100;
  const frames = sampleRate * VIDEO_DURATION_SECONDS;
  const channels = 2;
  const dataSize = frames * channels * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write("WAVE", 8);
  buffer.write("fmt ", 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22); buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28); buffer.writeUInt16LE(channels * 2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(dataSize, 40);

  const roots = [220, 233, 247, 262, 277, 294, 311, 330];
  const scale = [0, 2, 4, 7, 9, 12, 14];
  const root = roots[Math.floor(Math.random() * roots.length)];
  const bpm = 112 + Math.floor(Math.random() * 24);
  const beat = 60 / bpm;
  const progression = [0, 5, 3, 4];
  const melody = Array.from({ length: 96 }, () => scale[Math.floor(Math.random() * scale.length)]);
  const freq = (n: number) => root * Math.pow(2, n / 12);
  const env = (t: number, d: number) => {
    const a = Math.min(0.025, d * 0.2), r = Math.min(0.09, d * 0.35);
    if (t < 0 || t > d) return 0;
    if (t < a) return t / a;
    if (t > d - r) return Math.max(0, (d - t) / r);
    return 1;
  };
  const samples = new Float32Array(frames * 2);
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate;
    const bi = Math.floor(t / beat);
    const bt = t % beat;
    const chord = progression[Math.floor((bi % 8) / 2)] ?? 0;
    let l = 0, r = 0;
    for (const n of [chord, chord + 4, chord + 7]) {
      const f = freq(n);
      const x = 0.055 * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t));
      l += x; r += x * 0.96;
    }
    const bassD = beat * 0.72;
    if (bt < bassD) {
      const x = 0.18 * env(bt, bassD) * Math.sin(2 * Math.PI * freq(chord - 12) * bt);
      l += x; r += x;
    }
    const nt = t % (beat / 2);
    const note = melody[Math.floor(t / (beat / 2)) % melody.length];
    if (nt < beat * 0.42) {
      const x = 0.09 * env(nt, beat * 0.42) * Math.sin(2 * Math.PI * freq(note + 12) * nt);
      l += x; r += x;
    }
    if (bt < 0.16) {
      const x = 0.18 * Math.exp(-bt * 24) * Math.sin(2 * Math.PI * (105 - 55 * Math.min(1, bt / 0.16)) * bt);
      l += x; r += x;
    }
    const ht = t % (beat / 2);
    if (ht < 0.045) {
      const x = (Math.random() * 2 - 1) * 0.028 * Math.exp(-ht * 90);
      l += x; r += x * 0.9;
    }
    const fade = Math.max(0, Math.min(1, t / 0.08, (VIDEO_DURATION_SECONDS - t) / 0.12));
    samples[i * 2] = l * fade; samples[i * 2 + 1] = r * fade;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
  }
  const gain = peak ? Math.min(0.82 / peak, 1.8) : 1;
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * gain)) * 32767), 44 + i * 2);
  }
  await writeFile(outputPath, buffer);
}

async function downloadAsset(url: string, dest: string) {
  try {
    if (url.startsWith("data:")) {
      const match = url.match(/^data:[^;]+;base64,(.+)$/s);
      if (!match) return false;
      await writeFile(dest, Buffer.from(match[1], "base64"));
      return true;
    }
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok || !res.body) return false;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return false;
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

async function probeDuration(file: string) {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file]);
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("TTS audio davomiyligini aniqlab bo‘lmadi.");
  return duration;
}

function atempoChain(factor: number) {
  const filters: string[] = [];
  let f = factor;
  while (f < 0.5) { filters.push("atempo=0.5"); f /= 0.5; }
  while (f > 2) { filters.push("atempo=2.0"); f /= 2; }
  filters.push(`atempo=${f.toFixed(6)}`);
  return filters.join(",");
}

export async function buildMarketingVideo(_imagePath: string, outputPath: string, product: any, isShort: boolean) {
  const [width, height] = isShort ? [1080, 1920] : [1920, 1080];
  const work = join(tmpdir(), `oneoffice-video-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(work, { recursive: true });
  const music = join(work, "music.wav");
  const voiceRaw = join(work, "voice-raw.mp3");
  const voice = join(work, "voice.mp3");
  const subtitleJson = `${voiceRaw}.json`;

  try {
    const urls = Array.from(new Set(((product?.images as unknown[]) ?? []).map(clean).filter(Boolean))).slice(0, 1);
    const localImages: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const dest = join(work, `image-${i}.jpg`);
      if (await downloadAsset(urls[i], dest)) localImages.push(dest);
    }
    if (!localImages.length) {
      if (_imagePath) localImages.push(_imagePath);
      else throw new Error("Mahsulot rasmlari topilmadi.");
    }

    await makeMusicWav(music);
    const tts = new EdgeTTS({ voice: Math.random() < 0.5 ? "uz-UZ-MadinaNeural" : "uz-UZ-SardorNeural", lang: "uz-UZ", outputFormat: "audio-24khz-96kbitrate-mono-mp3", saveSubtitles: true, rate: "default", timeout: 20_000 });
    await tts.ttsPromise(narration(product), voiceRaw);

    const sourceDuration = await probeDuration(voiceRaw);
    const targetVoiceDuration = 14.85;
    await execFileAsync("ffmpeg", ["-i", voiceRaw, "-filter:a", atempoChain(sourceDuration / targetVoiceDuration), "-ar", "24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", "-y", voice], { timeout: 60_000 });
    const rawCues = JSON.parse(await readFile(subtitleJson, "utf8")) as Array<{ part?: string; start?: number; end?: number }>;
    const cueScale = targetVoiceDuration / sourceDuration;
    const cues = twoWordCues(rawCues).map(c => ({ ...c, start: c.start * cueScale, end: c.end * cueScale }));

    const n = localImages.length;
    const transition = n <= 2 ? 0.65 : n <= 5 ? 0.5 : 0.35;
    const slideDuration = (VIDEO_DURATION_SECONDS + (n - 1) * transition) / n;
    const frames = Math.max(2, Math.round(slideDuration * 30));
    const inputs: string[] = [];
    const filters: string[] = [];

    for (let i = 0; i < n; i++) {
      inputs.push("-loop", "1", "-t", slideDuration.toFixed(3), "-i", localImages[i]);
      const zoom = i % 2 === 0 ? `1+0.055*on/${frames - 1}` : `1.055-0.055*on/${frames - 1}`;
      filters.push(`[${i}:v]scale=${width * 1.12}:${height * 1.12}:force_original_aspect_ratio=increase,crop=${width * 1.12}:${height * 1.12},zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=30,setsar=1[v${i}]`);
    }

    let last = "v0";
    let accumulated = slideDuration - transition;
    for (let i = 1; i < n; i++) {
      const out = `x${i}`;
      filters.push(`[${last}][v${i}]xfade=transition=${TRANSITIONS[(i - 1) % TRANSITIONS.length]}:duration=${transition}:offset=${accumulated.toFixed(3)}[${out}]`);
      last = out;
      accumulated += slideDuration - transition;
    }

    const captionFilters = cues.map(c => {
      const start = Math.max(0, Math.min(14.98, c.start));
      const end = Math.max(start + 0.02, Math.min(14.99, c.end));
      return `drawtext=fontfile=${BOLD_FONT}:text='${drawEscape(c.text)}':fontcolor=black:fontsize=${isShort ? 78 : 58}:box=1:boxcolor=white@0.97:boxborderw=${isShort ? 24 : 18}:x=(w-text_w)/2:y=h*0.78:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`;
    });
    filters.push(`[${last}]${captionFilters.length ? captionFilters.join(",") : "null"}[vout]`);

    const args = [
      ...inputs,
      "-i", music,
      "-i", voice,
      "-filter_complex", `${filters.join(";")};[${n}:a]volume=0.14[m];[${n + 1}:a]volume=1.0[v];[m][v]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`,
      "-map", "[vout]", "-map", "[a]", "-t", String(VIDEO_DURATION_SECONDS), "-r", "30",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "27", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", "-movflags", "+faststart", "-y", outputPath,
    ];
    await execFileAsync("ffmpeg", args, { timeout: 180_000 });
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}
