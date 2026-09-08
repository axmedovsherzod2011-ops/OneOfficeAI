import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { EdgeTTS } from "node-edge-tts";

const execFileAsync = promisify(execFile);
export const VIDEO_DURATION_SECONDS = 15;
const MUSIC_SECONDS = 15;

function makeMusicWav(outputPath: string) {
  const sampleRate = 44100;
  const frames = sampleRate * MUSIC_SECONDS;
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
  const melody = Array.from({ length: 64 }, () => scale[Math.floor(Math.random() * scale.length)]);
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
    const fade = Math.max(0, Math.min(1, t / 0.08, (MUSIC_SECONDS - t) / 0.12));
    samples[i * 2] = l * fade; samples[i * 2 + 1] = r * fade;
    peak = Math.max(peak, Math.abs(samples[i * 2]), Math.abs(samples[i * 2 + 1]));
  }
  const gain = peak ? Math.min(0.82 / peak, 1.8) : 1;
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * gain)) * 32767), 44 + i * 2);
  }
  return writeFile(outputPath, buffer);
}

function narration(product: any) {
  const name = String(product?.name ?? "").replace(/\s+/g, " ").trim();
  const category = String(product?.category ?? "").replace(/\s+/g, " ").trim();
  const description = String(product?.description ?? "").replace(/\s+/g, " ").trim();
  const sentence = description.split(/[.!?]/)[0]?.trim() ?? "";
  return [name, category, sentence].filter(Boolean).join(". ").slice(0, 320) || "Bu mahsulot haqida qisqa ma'lumot.";
}

function drawEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/%/g, "\\%").replace(/,/g, "\\,");
}

type Cue = { text: string; start: number; end: number };
function twoWordCues(raw: Array<{ part?: string; start?: number; end?: number }>): Cue[] {
  const words = raw.map(x => ({ text: String(x.part ?? "").trim(), start: Number(x.start), end: Number(x.end) }))
    .filter(x => x.text && Number.isFinite(x.start) && Number.isFinite(x.end));
  const cues: Cue[] = [];
  for (let i = 0; i < words.length; i += 2) {
    const a = words[i], b = words[i + 1];
    cues.push({ text: [a.text, b?.text].filter(Boolean).join(" ").slice(0, 70), start: a.start / 1000, end: (b?.end ?? a.end) / 1000 });
  }
  return cues.filter(x => x.start < VIDEO_DURATION_SECONDS && x.end > 0);
}

export async function buildMarketingVideo(imagePath: string, outputPath: string, product: any, isShort: boolean) {
  const [width, height] = isShort ? [1080, 1920] : [1920, 1080];
  const work = join(tmpdir(), `oneoffice-video-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(work, { recursive: true });
  const music = join(work, "music.wav");
  const voice = join(work, "voice.mp3");
  const subtitleJson = `${voice}.json`;
  try {
    await makeMusicWav(music);
    const tts = new EdgeTTS({
      voice: Math.random() < 0.5 ? "uz-UZ-MadinaNeural" : "uz-UZ-SardorNeural",
      lang: "uz-UZ",
      outputFormat: "audio-24khz-96kbitrate-mono-mp3",
      saveSubtitles: true,
      rate: "+4%",
      timeout: 20000,
    });
    await tts.ttsPromise(narration(product), voice);
    const raw = JSON.parse(await readFile(subtitleJson, "utf8")) as Array<{ part?: string; start?: number; end?: number }>;
    const cues = twoWordCues(raw);
    const base = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`;
    const captions = cues.map(c => `drawtext=text='${drawEscape(c.text)}':fontcolor=white:fontsize=${isShort ? 70 : 54}:font='DejaVu Sans':borderw=3:bordercolor=black@0.75:box=1:boxcolor=black@0.48:boxborderw=18:x=(w-text_w)/2:y=h*0.80:enable='between(t,${Math.max(0, c.start).toFixed(3)},${Math.min(VIDEO_DURATION_SECONDS, c.end).toFixed(3)})'`).join(",");
    const vf = captions ? `${base},${captions}` : base;
    await execFileAsync("ffmpeg", [
      "-loop", "1", "-i", imagePath, "-i", music, "-i", voice,
      "-filter_complex", "[1:a]volume=0.16[m];[2:a]volume=1.0[v];[m][v]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[a]",
      "-map", "0:v:0", "-map", "[a]", "-vf", vf, "-t", String(VIDEO_DURATION_SECONDS), "-r", "30",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "27", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", "-movflags", "+faststart", "-y", outputPath,
    ], { timeout: 180000 });
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}
