import { GoogleGenAI } from "@google/genai";

if (!process.env.CAPTION_CPU_URL && !process.env.GEMINI_API_KEY) {
  throw new Error("CAPTION_CPU_URL yoki GEMINI_API_KEY sozlanishi kerak.");
}

const GEMINI_KEYS = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(
  (key): key is string => !!key,
);

export const geminiClients = GEMINI_KEYS.map((apiKey) => new GoogleGenAI({ apiKey }));
export const geminiAi = geminiClients[0] ?? null;

export async function withGeminiClients<T>(fn: (client: GoogleGenAI) => Promise<T>): Promise<T> {
  if (geminiClients.length === 0) throw new Error("GEMINI_API_KEY sozlanmagan");
  let lastErr: unknown;
  for (let i = 0; i < geminiClients.length; i++) {
    try {
      return await fn(geminiClients[i]);
    } catch (err) {
      lastErr = err;
      console.warn(`Gemini kalit #${i + 1} muvaffaqiyatsiz:`, err);
    }
  }
  throw lastErr;
}

export const IMAGE_MODEL = "gemini-3.1-flash-image";
export const GEMINI_TEXT_MODEL = "gemini-3.6-flash";

async function callCpuText(systemPrompt: string, userPrompt: string): Promise<string> {
  const baseUrl = process.env.CAPTION_CPU_URL?.trim().replace(/\/$/, "");
  if (!baseUrl) throw new Error("CAPTION_CPU_URL sozlanmagan — cloud text fallback mavjud emas");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        max_new_tokens: 1024,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`CPU AI error ${res.status}: ${bodyText.slice(0, 300)}`);
    }
    const data = (await res.json()) as { text?: string };
    if (!data.text?.trim()) throw new Error("CPU AI javobida matn topilmadi");
    console.log("[AI] engine=cpu model=SmolLM2-135M-Instruct");
    return data.text.trim();
  } finally {
    clearTimeout(timer);
  }
}

// ALL server-side text generation uses the OneOffice CPU AI.
// There is intentionally NO Groq/Cerebras/Gemini/Mistral text fallback.
export async function generateText(systemPrompt: string, userPrompt: string): Promise<string> {
  return callCpuText(systemPrompt, userPrompt);
}

export async function fetchImageBuffer(
  url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/*",
        Referer: "https://duckduckgo.com/",
      },
    });
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || !contentType.startsWith("image/")) return null;
    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType };
  } catch {
    return null;
  }
}
