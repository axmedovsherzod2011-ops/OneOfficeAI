import { GoogleGenAI } from "@google/genai";

if (
  !process.env.GROQ_API_KEY &&
  !process.env.CEREBRAS_API_KEY &&
  !process.env.GEMINI_API_KEY &&
  !process.env.MISTRAL_API_KEY &&
  !process.env.CAPTION_CPU_URL
) {
  throw new Error(
    "Kamida bitta AI xizmati kerak: cloud AI kaliti yoki CAPTION_CPU_URL.",
  );
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
      return await withRetry(() => fn(geminiClients[i]));
    } catch (err) {
      lastErr = err;
      console.warn(`Gemini kalit #${i + 1} muvaffaqiyatsiz:`, err);
    }
  }
  throw lastErr;
}

export const IMAGE_MODEL = "gemini-3.1-flash-image";
export const GEMINI_TEXT_MODEL = "gemini-3.6-flash";

function isRetryableError(err: unknown): boolean {
  const status =
    (err as { status?: number; code?: number })?.status ??
    (err as { status?: number; code?: number })?.code;
  if (status === 503 || status === 429 || status === 500) return true;
  const message = String((err as Error)?.message ?? err ?? "");
  return /503|overloaded|high demand|unavailable|429|rate limit/i.test(message);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 3, baseDelayMs = 1000 } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLastAttempt = attempt === retries;
      if (isLastAttempt || !isRetryableError(err)) throw err;
      const delay = baseDelayMs * 2 ** attempt;
      console.warn(`So'rov muvaffaqiyatsiz, ${delay}ms dan keyin qayta urinamiz...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

interface OpenAiCompatibleResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

async function callGroq(systemPrompt: string, userPrompt: string, jsonMode = true): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      max_tokens: 8192,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const err = new Error(`Groq API error ${res.status}: ${bodyText.slice(0, 300)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const data = (await res.json()) as OpenAiCompatibleResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq javobida matn topilmadi");
  return content;
}

const CEREBRAS_MODEL = "gpt-oss-120b";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";

async function callCerebras(systemPrompt: string, userPrompt: string, jsonMode = true): Promise<string> {
  const res = await fetch(CEREBRAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}` },
    body: JSON.stringify({
      model: CEREBRAS_MODEL,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      max_tokens: 8192,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const err = new Error(`Cerebras API error ${res.status}: ${bodyText.slice(0, 300)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const data = (await res.json()) as OpenAiCompatibleResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Cerebras javobida matn topilmadi");
  return content;
}

async function callGeminiText(systemPrompt: string, userPrompt: string, jsonMode = true): Promise<string> {
  return withGeminiClients(async (client) => {
    const result = await client.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: { systemInstruction: systemPrompt, ...(jsonMode ? { responseMimeType: "application/json" } : {}) },
    });
    const content = result.text;
    if (!content) throw new Error("Gemini javobida matn topilmadi");
    return content;
  });
}

const MISTRAL_MODEL = "mistral-small-latest";
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

async function callMistral(systemPrompt: string, userPrompt: string, jsonMode = true): Promise<string> {
  const res = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      max_tokens: 8192,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const err = new Error(`Mistral API error ${res.status}: ${bodyText.slice(0, 300)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const data = (await res.json()) as OpenAiCompatibleResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Mistral javobida matn topilmadi");
  return content;
}

async function callCpuText(systemPrompt: string, userPrompt: string): Promise<string> {
  const baseUrl = process.env.CAPTION_CPU_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("CAPTION_CPU_URL sozlanmagan");

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

// Structured AI generation for product posts/research now uses the OneOffice CPU model only.
// Cloud providers remain available for image generation and other explicitly cloud-backed code.
export async function generateText(systemPrompt: string, userPrompt: string): Promise<string> {
  return callCpuText(systemPrompt, userPrompt);
}

export async function generateFreeText(systemPrompt: string, userPrompt: string): Promise<string> {
  return runProviderChain(systemPrompt, userPrompt, false);
}

async function runProviderChain(
  systemPrompt: string,
  userPrompt: string,
  jsonMode: boolean,
): Promise<string> {
  const providers: Array<{ name: string; enabled: boolean; call: () => Promise<string> }> = [
    { name: "Groq", enabled: !!process.env.GROQ_API_KEY, call: () => callGroq(systemPrompt, userPrompt, jsonMode) },
    { name: "Cerebras", enabled: !!process.env.CEREBRAS_API_KEY, call: () => callCerebras(systemPrompt, userPrompt, jsonMode) },
    { name: "Gemini", enabled: !!geminiAi, call: () => callGeminiText(systemPrompt, userPrompt, jsonMode) },
    { name: "Mistral", enabled: !!process.env.MISTRAL_API_KEY, call: () => callMistral(systemPrompt, userPrompt, jsonMode) },
  ];

  let lastErr: unknown;
  for (const provider of providers) {
    if (!provider.enabled) continue;
    try {
      return await withRetry(provider.call);
    } catch (err) {
      console.warn(`${provider.name} muvaffaqiyatsiz, keyingi provayderga o'tamiz:`, err);
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("Hech qanday AI provayder sozlanmagan");
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
