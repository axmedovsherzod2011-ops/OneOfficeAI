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

// Image generation (and Gemini text fallback) client. Optional — if no
// Gemini key is set, image generation is disabled but the rest of the app
// keeps working off the other providers.
//
// Bir nechta Gemini kalitni qo'llab-quvvatlaymiz (GEMINI_API_KEY,
// GEMINI_API_KEY_2, ...) — bittasi limitga yetsa (429), avtomatik
// keyingi kalitga o'tamiz, faqat shundan keyin navbatdagi provayderga
// (Mistral) tushamiz. Test paytida bepul limit tez tugab qolishining
// eng oson yechimi shu.
const GEMINI_KEYS = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(
  (key): key is string => !!key,
);

export const geminiClients = GEMINI_KEYS.map((apiKey) => new GoogleGenAI({ apiKey }));

// Orqaga moslik uchun: birinchi kalit bilan ishlaydigan bitta client
// (to'g'ridan-to'g'ri geminiAi.models... chaqiradigan eski kod uchun).
export const geminiAi = geminiClients[0] ?? null;

// Ko'p-kalitli har qanday Gemini chaqiruvi uchun umumiy yordamchi: har bir
// kalitni birma-bir sinaydi, biri limitga yetsa (yoki boshqa xato bersa)
// keyingisiga o'tadi. Rasm generatsiyasi va vision (rasm orqali aniqlash)
// kabi to'g'ridan-to'g'ri geminiAi ishlatuvchi joylar buni chaqiradi.
export async function withGeminiClients<T>(fn: (client: GoogleGenAI) => Promise<T>): Promise<T> {
  if (geminiClients.length === 0) throw new Error("GEMINI_API_KEY sozlanmagan");
  let lastErr: unknown;
  for (let i = 0; i < geminiClients.length; i++) {
    try {
      return await withRetry(() => fn(geminiClients[i]));
    } catch (err) {
      lastErr = err;
      console.warn(
        `Gemini kalit #${i + 1} muvaffaqiyatsiz (limit bo'lishi mumkin), keyingi kalitga o'tamiz:`,
        err,
      );
    }
  }
  throw lastErr;
}

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

async function callGroq(systemPrompt: string, userPrompt: string, jsonMode = true): Promise<string> {
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
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
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

async function callCerebras(systemPrompt: string, userPrompt: string, jsonMode = true): Promise<string> {
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
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
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

async function callGeminiText(systemPrompt: string, userPrompt: string, jsonMode = true): Promise<string> {
  return withGeminiClients(async (client) => {
    const result = await client.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemPrompt,
        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    });

    const content = result.text;
    if (!content) throw new Error("Gemini javobida matn topilmadi");
    return content;
  });
}

// ---------------------------------------------------------------------------
// Provider #4: Mistral (last resort — generous monthly quota, ~1 req/sec)
// ---------------------------------------------------------------------------

const MISTRAL_MODEL = "mistral-small-latest";
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

async function callMistral(systemPrompt: string, userPrompt: string, jsonMode = true): Promise<string> {
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
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
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
  return runProviderChain(systemPrompt, userPrompt, true);
}

// Same fallback chain as generateText, but WITHOUT forcing JSON output —
// for callers that want a plain conversational answer (OneHelp chat,
// delivery-info polish) rather than a structured object. Using
// generateText (JSON-forced) for these was a real bug: every provider
// here enforces json_object/application-json response mode at the API
// level when asked, so the model has no choice but to wrap its answer in
// *some* JSON shape (e.g. `{"reply": "..."}`) — that's not a model quirk,
// it's the API contract generateText opts into on purpose for its actual
// intended callers (productCard.ts, enrich.ts — both parse structured
// JSON back out). This sibling function opts back out of that for
// free-text use cases.
export async function generateFreeText(systemPrompt: string, userPrompt: string): Promise<string> {
  return runProviderChain(systemPrompt, userPrompt, false);
}

async function runProviderChain(
  systemPrompt: string,
  userPrompt: string,
  jsonMode: boolean,
): Promise<string> {
  const providers: Array<{ name: string; enabled: boolean; call: () => Promise<string> }> = [
    {
      name: "Groq",
      enabled: !!process.env.GROQ_API_KEY,
      call: () => callGroq(systemPrompt, userPrompt, jsonMode),
    },
    {
      name: "Cerebras",
      enabled: !!process.env.CEREBRAS_API_KEY,
      call: () => callCerebras(systemPrompt, userPrompt, jsonMode),
    },
    {
      name: "Gemini",
      enabled: !!geminiAi,
      call: () => callGeminiText(systemPrompt, userPrompt, jsonMode),
    },
    {
      name: "Mistral",
      enabled: !!process.env.MISTRAL_API_KEY,
      call: () => callMistral(systemPrompt, userPrompt, jsonMode),
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
