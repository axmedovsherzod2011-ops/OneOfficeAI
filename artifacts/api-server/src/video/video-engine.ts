import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomInt } from "crypto";
import { EdgeTTS } from "node-edge-tts";

const execFileAsync = promisify(execFile);
export const VIDEO_DURATION_SECONDS = 20;

const TRANSITIONS = ["fade", "wipeleft", "slideright", "circleopen", "slideup", "slidedown"];
const BOLD_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function money(product: any) {
  const price = product?.sellPrice ?? product?.price;
  const currency = clean(product?.currency) || "UZS";
  return price !== undefined && price !== null && String(price).trim()
    ? `${price} ${currency}`
    : "";
}

function bulletLines(raw: unknown): string[] {
  return String(raw ?? "")
    .split(/\n+/)
    .map((line) => line.replace(/^[^\p{L}\p{N}]+/u, "").trim())
    .filter(Boolean);
}

function firstSentence(raw: unknown): string {
  return clean(raw).split(/[.!?]/).map(clean).filter(Boolean)[0] ?? "";
}

function findCharacteristic(characteristics: unknown, ...labels: string[]): string {
  if (!Array.isArray(characteristics)) return "";
  const wanted = labels.map((l) => l.toLowerCase());
  for (const c of characteristics) {
    const label = clean((c as any)?.label).toLowerCase();
    if (!label) continue;
    if (wanted.some((w) => label === w || label.includes(w))) {
      return clean((c as any)?.value);
    }
  }
  return "";
}

function narration(product: any): string {
  const name = clean(product?.name);
  const characteristics = product?.characteristics;
  const hajm = findCharacteristic(characteristics, "hajm", "hajmi", "o'lcham", "olcham");
  const turi = findCharacteristic(characteristics, "turi", "tur") || clean(product?.category);
  const advantage = bulletLines(product?.extras)[0] || firstSentence(product?.description);
  const usageSteps = bulletLines(product?.usageGuide).slice(0, 2);
  const lifehack = bulletLines(product?.lifehacks)[0] ?? "";
  const price = money(product);

  const beats: string[] = [];
  beats.push(name ? `${name} bilan tanishing!` : "");

  if (hajm || turi || advantage) {
    let explain = "Bu";
    if (hajm) explain += ` ${hajm} hajmli`;
    if (turi) explain += ` ${turi}`;
    explain = explain === "Bu" ? "" : `${explain}.`;
    if (advantage) explain += `${explain ? " " : ""}Uning asosiy afzalligi — ${advantage}.`;
    beats.push(explain);
  }

  if (usageSteps.length) beats.push(`Ishlatish uchun: ${usageSteps.join(". ")}.`);
  if (lifehack) beats.push(`Lifehack: ${lifehack}.`);
  if (price) beats.push(`Narxi: ${price}.`);

  return beats.filter(Boolean).join(" ").slice(0, 900);
}

type Cue = { text: string; start: number; end: number };
type RawWord = { part?: string; start?: number; end?: number };

function normalizedWords(raw: RawWord[]) {
  return raw
    .map((x) => ({ text: clean(x.part), start: Number(x.start), end: Number(x.end) }))
    .filter((x) => x.text && Number.isFinite(x.start) && Number.isFinite(x.end) && x.end >= x.start);
}

function twoWordCues(raw: RawWord[]): Cue[] {
  const words = normalizedWords(raw);
  const cues: Cue[] = [];
  for (let i = 0; i < words.length; i += 2) {
    const a = words[i];
    const b = words[i + 1];
    cues.push({
      text: [a.text, b?.text].filter(Boolean).join(" ").slice(0, 70),
      start: a.start / 1000,
      end: (b?.end ?? a.end) / 1000,
    });
  }
  return cues.filter((x) => x.start < VIDEO_DURATION_SECONDS && x.end > 0);
}

function priceCue(raw: RawWord[], product: any): Cue | null {
  const price = clean(product?.sellPrice ?? product?.price);
  const digits = price.replace(/\D/g, "");
  if (!digits) return null;

  const words = normalizedWords(raw);
  const index = words.findIndex((word) => word.text.replace(/\D/g, "").includes(digits));
  if (index < 0) return null;

  const startWord = words[index];
  const endWord = words[Math.min(words.length - 1, index + 2)];
  return {
    text: money(product),
    start: startWord.start / 1000,
    end: Math.max(startWord.end, endWord.end) / 1000,
  };
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

  const seed = randomInt(0, 0x7fffffff);
  let state = seed;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  const pick = <T,>(items: T[]) => items[Math.floor(next() * items.length)];
  const roots = [196, 208, 220, 233, 247, 262, 277, 294, 311, 330, 349];
  const scale = [0, 2, 4, 7, 9, 12, 14];
  const progressions = [[0, 5, 3, 4], [0, 3, 5, 4], [0, 4, 5, 3], [0, 5, 4, 3], [0, 3, 4, 5], [0, 4, 3, 5]];
  const root = pick(roots);
  const bpm = 104 + Math.floor(next() * 31);
  const beat = 60 / bpm;
  const progression = pick(progressions);
  const melody = Array.from({ length: 96 }, () => pick(scale));
  const style = Math.floor(next() * 4);
  const harmonicMix = 0.22 + next() * 0.18;
  const melodyLevel = 0.065 + next() * 0.05;
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
      const harmonic = style === 0 ? Math.sin(4 * Math.PI * f * t) : style === 1 ? Math.sin(6 * Math.PI * f * t) : Math.sin(3 * Math.PI * f * t);
      const x = 0.052 * (Math.sin(2 * Math.PI * f * t) + harmonicMix * harmonic);
      l += x; r += x * (0.92 + next() * 0.06);
    }
    const bassD = beat * (0.62 + style * 0.05);
    if (bt < bassD) {
      const x = (0.16 + style * 0.015) * env(bt, bassD) * Math.sin(2 * Math.PI * freq(chord - 12) * bt);
      l += x; r += x;
    }
    const nt = t % (beat / (style === 3 ? 1 : 2));
    const note = melody[Math.floor(t / (beat / 2)) % melody.length];
    if (nt < beat * (0.34 + style * 0.035)) {
      const wave = style === 2 ? Math.sin(2 * Math.PI * freq(note + 12) * nt) + 0.22 * Math.sin(2 * Math.PI * freq(note + 19) * nt) : Math.sin(2 * Math.PI * freq(note + 12) * nt);
      const x = melodyLevel * env(nt, beat * 0.42) * wave;
      l += x; r += x * 0.97;
    }
    if (bt < 0.14) {
      const x = (0.14 + style * 0.015) * Math.exp(-bt * (22 + style * 4)) * Math.sin(2 * Math.PI * (92 + style * 17 - 45 * Math.min(1, bt / 0.14)) * bt);
      l += x; r += x;
    }
    const hatStep = style === 1 ? beat / 3 : beat / 2;
    const ht = t % hatStep;
    if (ht < 0.04) {
      const x = (next() * 2 - 1) * (0.022 + style * 0.004) * Math.exp(-ht * 95);
      l += x; r += x * 0.88;
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

async function makeCashSoundWav(outputPath: string) {
  const sampleRate = 44100;
  const duration = 0.85;
  const frames = Math.round(sampleRate * duration);
  const channels = 2;
  const dataSize = frames * channels * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write("WAVE", 8);
  buffer.write("fmt ", 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22); buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28); buffer.writeUInt16LE(channels * 2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(dataSize, 40);
  const notes = [
    { start: 0.00, freq: 880, length: 0.24, level: 0.28 },
    { start: 0.09, freq: 1320, length: 0.34, level: 0.25 },
    { start: 0.18, freq: 1760, length: 0.52, level: 0.20 },
  ];
  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (const note of notes) {
      const local = t - note.start;
      if (local >= 0 && local < note.length) {
        const decay = Math.exp(-local * 8.5);
        sample += note.level * decay * (Math.sin(2 * Math.PI * note.freq * local) + 0.22 * Math.sin(2 * Math.PI * note.freq * 2.01 * local));
      }
    }
    const sparkle = t > 0.02 ? 0.035 * Math.exp(-(t - 0.02) * 10) * Math.sin(2 * Math.PI * 2800 * (t - 0.02)) : 0;
    sample += sparkle;
    const fade = Math.min(1, t / 0.004) * Math.min(1, (duration - t) / 0.08);
    const value = Math.max(-1, Math.min(1, sample * fade * 0.8));
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 4);
    buffer.writeInt16LE(Math.round(value * 0.92 * 32767), 46 + i * 4);
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
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" },
      signal: AbortSignal.timeout(20_000),
    });
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
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ]);
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

// FFmpeg filtergraph syntax is NOT a shell syntax. Arguments are passed via
// execFile, so there is no shell escaping to do. For drawtext we deliberately
// use textfile instead of embedding user/AI text inside `text='...'`. This
// prevents apostrophes (Cho'tkaga), quotes, commas, colons, backslashes,
// percent signs and other Unicode punctuation from corrupting the filtergraph.
function escapeFilterPath(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function enableBetween(start: number, end: number) {
  // Commas inside FFmpeg expressions must be escaped when the expression is
  // supplied as a filter option. Do not wrap this expression in single quotes.
  return `between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`;
}

async function makeTextFile(work: string, prefix: string, text: string) {
  const path = join(work, `${prefix}-${randomInt(0, 0x7fffffff)}.txt`);
  await writeFile(path, text.replace(/\r?\n/g, " "), "utf8");
  return escapeFilterPath(path);
}

export async function buildMarketingVideo(_imagePath: string, outputPath: string, product: any, isShort: boolean) {
  const [width, height] = isShort ? [1080, 1920] : [1920, 1080];
  const work = join(tmpdir(), `oneoffice-video-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(work, { recursive: true });
  const music = join(work, "music.wav");
  const cash = join(work, "cash.wav");
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
    await makeCashSoundWav(cash);
    const tts = new EdgeTTS({
      voice: Math.random() < 0.5 ? "uz-UZ-MadinaNeural" : "uz-UZ-SardorNeural",
      lang: "uz-UZ",
      outputFormat: "audio-24khz-96kbitrate-mono-mp3",
      saveSubtitles: true,
      rate: "default",
      timeout: 20_000,
    });
    await tts.ttsPromise(narration(product), voiceRaw);

    const sourceDuration = await probeDuration(voiceRaw);
    const targetVoiceDuration = VIDEO_DURATION_SECONDS - 0.15;
    await execFileAsync("ffmpeg", [
      "-i", voiceRaw, "-filter:a", atempoChain(sourceDuration / targetVoiceDuration),
      "-ar", "24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", "-y", voice,
    ], { timeout: 60_000 });

    const rawCues = JSON.parse(await readFile(subtitleJson, "utf8")) as RawWord[];
    const cueScale = targetVoiceDuration / sourceDuration;
    const cues = twoWordCues(rawCues).map((c) => ({
      ...c, start: c.start * cueScale, end: c.end * cueScale,
    }));
    const rawPriceCue = priceCue(rawCues, product);
    const finalPriceCue = rawPriceCue
      ? { ...rawPriceCue, start: rawPriceCue.start * cueScale, end: rawPriceCue.end * cueScale }
      : null;

    const n = localImages.length;
    const transition = n <= 2 ? 0.65 : n <= 5 ? 0.5 : 0.35;
    const slideDuration = (VIDEO_DURATION_SECONDS + (n - 1) * transition) / n;
    const frames = Math.max(2, Math.round(slideDuration * 30));
    const inputs: string[] = [];
    const filters: string[] = [];

    const bigW = Math.round(width * 1.12);
    const bigH = Math.round(height * 1.12);
    for (let i = 0; i < n; i++) {
      inputs.push("-loop", "1", "-t", slideDuration.toFixed(3), "-i", localImages[i]);
      const zoom = i % 2 === 0 ? `1+0.055*on/${frames - 1}` : `1.055-0.055*on/${frames - 1}`;
      filters.push(
        `[${i}:v]scale=${bigW}:${bigH}:force_original_aspect_ratio=increase,crop=${bigW}:${bigH},gblur=sigma=25,eq=brightness=-0.08[bg${i}]`,
        `[${i}:v]scale=${bigW}:${bigH}:force_original_aspect_ratio=decrease[fg${i}]`,
        `[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2[comp${i}]`,
        `[comp${i}]zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=30,setsar=1[v${i}]`,
      );
    }

    let last = "v0";
    let accumulated = slideDuration - transition;
    for (let i = 1; i < n; i++) {
      const out = `x${i}`;
      filters.push(`[${last}][v${i}]xfade=transition=${TRANSITIONS[(i - 1) % TRANSITIONS.length]}:duration=${transition}:offset=${accumulated.toFixed(3)}[${out}]`);
      last = out;
      accumulated += slideDuration - transition;
    }

    const captionEnd = VIDEO_DURATION_SECONDS - 0.01;
    const captionFilters: string[] = [];
    for (let i = 0; i < cues.length; i++) {
      const c = cues[i];
      const start = Math.max(0, Math.min(captionEnd - 0.01, c.start));
      const end = Math.max(start + 0.02, Math.min(captionEnd, c.end));
      const textFile = await makeTextFile(work, `caption-${i}`, c.text);
      captionFilters.push(
        `drawtext=fontfile=${BOLD_FONT}:textfile=${textFile}:fontcolor=black:fontsize=${isShort ? 78 : 58}:box=1:boxcolor=white@0.97:boxborderw=${isShort ? 24 : 18}:x=(w-text_w)/2:y=h*0.78:enable=${enableBetween(start, end)}`,
      );
    }

    if (finalPriceCue) {
      const start = Math.max(0, Math.min(VIDEO_DURATION_SECONDS - 0.2, finalPriceCue.start));
      const end = Math.max(start + 0.20, Math.min(captionEnd, finalPriceCue.end));
      const priceTextFile = await makeTextFile(work, "price", finalPriceCue.text);
      captionFilters.push(
        `drawtext=fontfile=${BOLD_FONT}:textfile=${priceTextFile}:fontcolor=0x16a34a:fontsize=${isShort ? 92 : 68}:box=1:boxcolor=white@0.98:boxborderw=${isShort ? 28 : 20}:x=(w-text_w)/2:y=h*0.67:enable=${enableBetween(start, end)}`,
      );
    }

    filters.push(`[${last}]${captionFilters.length ? captionFilters.join(",") : "null"}[vout]`);

    const audioFilters = [
      `[${n}:a]volume=0.14[m]`,
      `[${n + 1}:a]volume=1.0[v]`,
    ];
    if (finalPriceCue) {
      const delayMs = Math.max(0, Math.round(finalPriceCue.start * 1000));
      audioFilters.push(`[${n + 2}:a]adelay=${delayMs}|${delayMs},volume=0.72[cashdelayed]`);
      audioFilters.push(`[m][v][cashdelayed]amix=inputs=3:duration=first:dropout_transition=0:normalize=0[a]`);
    } else {
      audioFilters.push(`[m][v]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`);
    }

    const args = [
      ...inputs,
      "-i", music,
      "-i", voice,
      "-i", cash,
      "-filter_complex", `${filters.join(";")};${audioFilters.join(";")}`,
      "-map", "[vout]", "-map", "[a]", "-t", String(VIDEO_DURATION_SECONDS), "-r", "30",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "27",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
      "-movflags", "+faststart", "-y", outputPath,
    ];

    await execFileAsync("ffmpeg", args, { timeout: 180_000 });
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}
