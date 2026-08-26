import { GoogleGenAI } from "@google/genai";

// ---------------------------------------------------------------------------
// Shared AI text-generation layer: Groq -> Cerebras -> Gemini -> Mistral
// fallback chain, plus the Gemini image client. Used by both routes/enrich.ts
// (single-shot post text) and ai/productCard.ts (the one-time deep research
// card). Kept in one place so a model-name fix (like the Aug 2026 mass
// deprecation across all 4 providers at once) only has to happen once.
// ---------------------------------------------------------------------------

if (
  !process.env.GROQ_API_KEY &&
  !process.env.CEREBRAS_API_KEY &&
  !process.env.GEMINI_API_KEY &&
  !process.env.MISTRAL_API_KEY
) {
  throw new Error(
    "Kamida bitta AI provayder kaliti kerak: GROQ_API_KEY, CEREBRAS_API_KEY, GEMINI_API_KEY yoki MISTRAL_API_KEY. Replit Secrets'da hech biri topilmadi.",
  );
}

// Image generation (and Gemini text fallback) client. Optional — if
// GEMINI_API_KEY is missing, image generation is disabled but the rest of
// the app keeps working off the other 3 text providers.
export const geminiAi = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

export const IMAGE_MODEL = "gemini-3.1-flash-image";
export const GEMINI_TEXT_MODEL = "gemini-3.6-flash";

// ---------------------------------------------------------------------------
// Retry helper for transient API errors (503 overloaded, 429 rate limit,
// network hiccups). Uses exponential backoff: 1s, 2s, 4s.
// ---------------------------------------------------------------------------

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
      const delay = baseDelayMs * 2 ** attempt; // 1s, 2s, 4s
      console.warn(
        `So'rov muvaffaqiyatsiz (urinish ${attempt + 1}/${retries + 1}), ${delay}ms dan keyin qayta urinamiz...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Provider #1: Groq (fastest, free, primary)
// ---------------------------------------------------------------------------

const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

interface OpenAiCompatibleResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

async function callGroq(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
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
    const bodyText = await res.text().catch(() => "");
    const err = new Error(`Groq API error ${res.status}: ${bodyText.slice(0, 300)}`) as Error & {
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

// ---------------------------------------------------------------------------
// Provider #2: Cerebras (very fast, free, ~14,400 req/day)
// ---------------------------------------------------------------------------

const CEREBRAS_MODEL = "gpt-oss-120b";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";

async function callCerebras(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(CEREBRAS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
    },
    body: JSON.stringify({
      model: CEREBRAS_MODEL,
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
    const bodyText = await res.text().catch(() => "");
    const err = new Error(
      `Cerebras API error ${res.status}: ${bodyText.slice(0, 300)}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  const data = (await res.json()) as OpenAiCompatibleResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Cerebras javobida matn topilmadi");
  return content;
}

// ---------------------------------------------------------------------------
// Provider #3: Gemini (text)
// ---------------------------------------------------------------------------

async function callGeminiText(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!geminiAi) throw new Error("GEMINI_API_KEY sozlanmagan");

  const result = await geminiAi.models.generateContent({
    model: GEMINI_TEXT_MODEL,
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

// ---------------------------------------------------------------------------
// Provider #4: Mistral (last resort — generous monthly quota, ~1 req/sec)
// ---------------------------------------------------------------------------

const MISTRAL_MODEL = "mistral-small-latest";
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

async function callMistral(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
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
    const bodyText = await res.text().catch(() => "");
    const err = new Error(
      `Mistral API error ${res.status}: ${bodyText.slice(0, 300)}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  const data = (await res.json()) as OpenAiCompatibleResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Mistral javobida matn topilmadi");
  return content;
}

// ---------------------------------------------------------------------------
// Master fallback chain: Groq -> Cerebras -> Gemini -> Mistral.
// Each provider is skipped entirely if its key isn't set. Each attempt gets
// its own retry-with-backoff. Only throws once every available provider has
// failed.
// ---------------------------------------------------------------------------

export async function generateText(systemPrompt: string, userPrompt: string): Promise<string> {
  const providers: Array<{ name: string; enabled: boolean; call: () => Promise<string> }> = [
    {
      name: "Groq",
      enabled: !!process.env.GROQ_API_KEY,
      call: () => callGroq(systemPrompt, userPrompt),
    },
    {
      name: "Cerebras",
      enabled: !!process.env.CEREBRAS_API_KEY,
      call: () => callCerebras(systemPrompt, userPrompt),
    },
    {
      name: "Gemini",
      enabled: !!geminiAi,
      call: () => callGeminiText(systemPrompt, userPrompt),
    },
    {
      name: "Mistral",
      enabled: !!process.env.MISTRAL_API_KEY,
      call: () => callMistral(systemPrompt, userPrompt),
    },
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

// ---------------------------------------------------------------------------
// Shared helper: fetch an external image's raw bytes, verifying it's really
// an image (many hotlink-protected/CDN URLs return HTML or a 403 instead).
// ---------------------------------------------------------------------------

export async function fetchImageBuffer(
  url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
