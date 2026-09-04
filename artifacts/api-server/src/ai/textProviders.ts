import { GoogleGenAI } from "@google/genai";

if (!process.env.CAPTION_CPU_URL && !process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.CEREBRAS_API_KEY && !process.env.MISTRAL_API_KEY) {
  throw new Error("AI provayder sozlanmagan");
}

const GEMINI_KEYS = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(
  (key): key is string => !!key,
);

export const geminiClients = GEMINI_KEYS.map((apiKey) => new GoogleGenAI({ apiKey }));
export const geminiAi = geminiClients[0] ?? null;

export async function withGeminiClients<T>(fn: (client: GoogleGenAI) => Promise<T>): Promise<T> {
  if (geminiClients.length === 0) throw new Error("GEMINI_API_KEY sozlanmagan");
  let lastErr: unknown;
  for (const client of geminiClients) {
    try {
      return await fn(client);
    } catch (err) {
      lastErr = err;
      console.warn("Gemini request failed:", err);
    }
  }
  throw lastErr;
}

export const IMAGE_MODEL = "gemini-3.1-flash-image";
export const GEMINI_TEXT_MODEL = "gemini-3.6-flash";

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

async function callCpuText(systemPrompt: string, userPrompt: string, maxNewTokens = 1024): Promise<string> {
  const baseUrl = process.env.CAPTION_CPU_URL?.trim().replace(/\/$/, "");
  if (!baseUrl) throw new Error("CAPTION_CPU_URL sozlanmagan");
  return callCpuEndpoint(baseUrl, systemPrompt, userPrompt, maxNewTokens, "caption-cpu");
}

async function callCpuEndpoint(
  baseUrl: string,
  systemPrompt: string,
  userPrompt: string,
  maxNewTokens: number,
  engine: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_prompt: systemPrompt, user_prompt: userPrompt, max_new_tokens: maxNewTokens }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`${engine} AI error ${res.status}: ${bodyText.slice(0, 300)}`);
    }
    const data = (await res.json()) as { text?: string };
    if (!data.text?.trim()) throw new Error(`${engine} AI javobida matn topilmadi`);
    console.log(`[AI] engine=${engine} endpoint=/generate`);
    return data.text.trim();
  } finally {
    clearTimeout(timer);
  }
}

interface ExternalProvider {
  name: string;
  key?: string;
  url: string;
  model: string;
}

const EXTERNAL_TEXT_PROVIDERS: ExternalProvider[] = [
  { name: "Mistral", key: process.env.MISTRAL_API_KEY, url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-small-latest" },
  { name: "Groq", key: process.env.GROQ_API_KEY, url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile" },
  { name: "Cerebras", key: process.env.CEREBRAS_API_KEY, url: "https://api.cerebras.ai/v1/chat/completions", model: "gpt-oss-120b" },
];

async function callExternalTextProvider(
  provider: ExternalProvider,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  if (!provider.key) throw new Error(`${provider.name} API key sozlanmagan`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(provider.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.key}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 768,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`${provider.name} API error ${res.status}: ${bodyText.slice(0, 300)}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error(`${provider.name} javobida matn topilmadi`);
    console.log(`[OneHelp AI] engine=${provider.name} model=${provider.model}`);
    return content;
  } finally {
    clearTimeout(timer);
  }
}

// Caption/product generation stays on the dedicated OneOffice CPU server.
export async function generateText(systemPrompt: string, userPrompt: string): Promise<string> {
  return callCpuText(systemPrompt, userPrompt, 1024);
}

export async function generateFreeText(systemPrompt: string, userPrompt: string): Promise<string> {
  return callCpuText(systemPrompt, userPrompt, 1024);
}

// OneHelp intentionally does NOT use the OneOffice CPU server.
// Fallback order: Gemini -> Mistral -> Groq -> Cerebras.
export async function generateOneHelpText(systemPrompt: string, userPrompt: string): Promise<string> {
  const errors: string[] = [];

  if (geminiClients.length > 0) {
    try {
      console.log("[OneHelp AI] trying Gemini");
      return await callGeminiText(systemPrompt, userPrompt, false);
    } catch (err) {
      errors.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`);
      console.warn("[OneHelp AI] Gemini failed, trying Mistral");
    }
  }

  for (const provider of EXTERNAL_TEXT_PROVIDERS) {
    if (!provider.key) continue;
    try {
      console.log(`[OneHelp AI] trying ${provider.name}`);
      return await callExternalTextProvider(provider, systemPrompt, userPrompt);
    } catch (err) {
      errors.push(`${provider.name}: ${err instanceof Error ? err.message : String(err)}`);
      console.warn(`[OneHelp AI] ${provider.name} failed, trying next provider`);
    }
  }

  throw new Error(`OneHelp barcha AI provayderlarda ishlamadi: ${errors.join(" | ")}`);
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
