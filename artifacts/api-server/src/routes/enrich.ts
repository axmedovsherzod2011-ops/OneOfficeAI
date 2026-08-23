import { Router } from "express";
import { GoogleGenAI, Modality } from "@google/genai";

const router = Router();

// ---------------------------------------------------------------------------
// At least ONE text-generation provider key must be present. We no longer
// require Groq specifically — Groq is just the first (fastest/free) link in
// a 4-provider fallback chain: Groq -> Cerebras -> Gemini -> Mistral.
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

// Image generation still uses Gemini.
// This is optional — if GEMINI_API_KEY is missing, image generation is
// disabled but the rest of the app (text + DDG image search) keeps working.
const geminiAi = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;
const IMAGE_MODEL = "gemini-3.1-flash-image";
const GEMINI_TEXT_MODEL = "gemini-3.6-flash";

// ---------------------------------------------------------------------------
// Shared helper: fetch an external image's raw bytes, verifying it's really
// an image (many hotlink-protected/CDN URLs return HTML or a 403 instead).
// ---------------------------------------------------------------------------

async function fetchImageBuffer(
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

async function withRetry<T>(
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

async function callGroq(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
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
    const err = new Error(
      `Groq API error ${res.status}: ${bodyText.slice(0, 300)}`,
    ) as Error & { status?: number };
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

async function callCerebras(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
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
// Provider #3: Gemini (text) — reuses the same client/key used for image
// generation below.
// ---------------------------------------------------------------------------

async function callGeminiText(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
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

async function callMistral(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
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
// its own retry-with-backoff. Only throws once every available provider
// has failed.
// ---------------------------------------------------------------------------

async function generateText(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const providers: Array<{
    name: string;
    enabled: boolean;
    call: () => Promise<string>;
  }> = [
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
      console.warn(
        `${provider.name} muvaffaqiyatsiz, keyingi provayderga o'tamiz:`,
        err,
      );
      lastErr = err;
    }
  }

  throw lastErr ?? new Error("Hech qanday AI provayder sozlanmagan");
}

// ---------------------------------------------------------------------------
// DuckDuckGo image search (no API key required)
// ---------------------------------------------------------------------------

interface DdgImage {
  url: string;
  thumbnail: string;
  title: string;
  source: string;
}

async function searchProductImages(
  query: string,
  count = 6,
): Promise<DdgImage[]> {
  try {
    // Step 1: get the VQD token DDG requires for image searches
    const vqdRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      },
    );
    const html = await vqdRes.text();
    const vqdMatch = html.match(/vqd=["']?([^"'&\s]+)["']?/);
    const vqd = vqdMatch?.[1];
    if (!vqd) return [];

    // Step 2: fetch image results
    const url = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&vqd=${vqd}&f=,,,,,&p=1`;
    const imgRes = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://duckduckgo.com/",
        Accept: "application/json",
      },
    });
    const data = (await imgRes.json()) as {
      results?: Array<{
        image?: string;
        thumbnail?: string;
        title?: string;
        url?: string;
      }>;
    };

    return (data.results ?? [])
      .filter((r) => r.image)
      .slice(0, count)
      .map((r) => ({
        url: r.image!,
        thumbnail: r.thumbnail || r.image!,
        title: r.title || query,
        source: r.url || "",
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// DuckDuckGo TEXT search — finds real pages about the exact product (name +
// seller notes like brand/origin + category) so the AI grounds the
// description in facts it actually found, instead of inventing generic
// copy. No API key required (same approach as the image search above).
// ---------------------------------------------------------------------------

interface WebSnippet {
  title: string;
  snippet: string;
  source: string;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "");
}

async function searchProductWebInfo(
  query: string,
  count = 5,
): Promise<WebSnippet[]> {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        method: "POST",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `q=${encodeURIComponent(query)}`,
      },
    );
    const html = await res.text();

    const results: WebSnippet[] = [];
    const blockRegex =
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(html)) && results.length < count) {
      const [, url, titleHtml, snippetHtml] = match;
      const title = decodeHtmlEntities(titleHtml).trim();
      const snippet = decodeHtmlEntities(snippetHtml).trim();
      if (title || snippet) {
        results.push({ title, snippet, source: url });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// Turns the raw search hits into a compact block the AI prompt can cite
// facts from. Kept short (title + snippet only) to stay within token
// budget while still giving the model real, product-specific grounding.
function formatWebContext(results: WebSnippet[]): string {
  if (!results.length) return "";
  return results
    .map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}`)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Image search proxy endpoint
// ---------------------------------------------------------------------------

router.get("/images", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const count = Math.min(Number(req.query.count) || 6, 12);
  if (!q) {
    res.status(400).json({ error: "q is required" });
    return;
  }
  const images = await searchProductImages(q, count);
  res.json({ images });
});

// ---------------------------------------------------------------------------
// Image proxy — lets the browser display scraped image URLs that would
// otherwise fail to load due to hotlink protection or missing CORS headers.
// ---------------------------------------------------------------------------

router.get("/images/proxy", async (req, res) => {
  const url = String(req.query.url || "");
  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }
  const img = await fetchImageBuffer(url);
  if (!img) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", img.contentType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(img.buffer);
});

// ---------------------------------------------------------------------------
// AI image generation — generates a brand-new, similar-looking product photo
// with Gemini's image model. This avoids publishing scraped/copyrighted
// photos directly and sidesteps the reliability issues of hotlinked URLs.
// (Requires GEMINI_API_KEY.)
// ---------------------------------------------------------------------------

router.post("/images/generate", async (req, res) => {
  const { referenceUrl, productName, category } = req.body as {
    referenceUrl?: string;
    productName?: string;
    category?: string;
  };

  if (!referenceUrl || !productName) {
    res
      .status(400)
      .json({ error: "referenceUrl and productName are required" });
    return;
  }

  if (!geminiAi) {
    res.status(503).json({
      error: "Rasm generatsiya xizmati sozlanmagan (GEMINI_API_KEY yo'q).",
    });
    return;
  }
  const client = geminiAi;

  const ref = await fetchImageBuffer(referenceUrl);
  if (!ref) {
    res.status(400).json({ error: "Namuna rasmni yuklab bo'lmadi." });
    return;
  }

  try {
    const result = await withRetry(() =>
      client.models.generateContent({
        model: IMAGE_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  data: ref.buffer.toString("base64"),
                  mimeType: ref.contentType,
                },
              },
              {
                text: `Generate a brand-new, high-quality professional e-commerce product photo of "${productName}"${category ? ` (category: ${category})` : ""}, closely matching the composition, framing, lighting, and style of the reference image. Clean background, premium and realistic, studio-quality. Do not include any text, watermark, or logo in the image.`,
              },
            ],
          },
        ],
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
      }),
    );

    const candidate = result.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find(
      (part: { inlineData?: { data?: string; mimeType?: string } }) =>
        part.inlineData,
    );

    if (!imagePart?.inlineData?.data) {
      res.status(502).json({ error: "AI rasm generatsiya qila olmadi." });
      return;
    }

    const mimeType = imagePart.inlineData.mimeType || "image/png";
    res.json({
      dataUrl: `data:${mimeType};base64,${imagePart.inlineData.data}`,
    });
  } catch (err) {
    console.error("Image generation failed after retries:", err);
    res.status(503).json({
      error:
        "Rasm generatsiya xizmati hozir band. Birozdan so'ng qayta urinib ko'ring.",
    });
  }
});

// ---------------------------------------------------------------------------
// Builds the final Telegram post text ourselves instead of trusting the AI
// to remember to fold every field in. Each section is only added if the AI
// actually returned it, and every section is separated by a blank line
// (double "\n") so Telegram renders clear paragraph breaks.
// ---------------------------------------------------------------------------

function buildPostText(
  name: string,
  price: string,
  enriched: Record<string, unknown>,
): string {
  const get = (key: string) => String(enriched[key] ?? "").trim();

  const blocks: string[] = [];

  blocks.push(get("headline") || `✨ ${name}`);

  if (get("description")) blocks.push(get("description"));

  if (get("extras")) blocks.push(`🔧 Xususiyatlar:\n${get("extras")}`);

  if (get("usageGuide"))
    blocks.push(`🎯 Ishlatish bo'yicha maslahat:\n${get("usageGuide")}`);

  const dims = [
    get("dimensions") ? `📐 ${get("dimensions")}` : "",
    get("weight") ? `⚖️ ${get("weight")}` : "",
  ]
    .filter(Boolean)
    .join("   ");
  if (dims) blocks.push(dims);

  if (get("lifehacks")) blocks.push(`💡 Lifehack:\n${get("lifehacks")}`);

  const priceDiff = get("priceDiff");
  blocks.push(priceDiff ? `💰 ${price} UZS (${priceDiff})` : `💰 ${price} UZS`);

  blocks.push("📲 Buyurtma uchun yozing!");

  if (get("hashtags")) blocks.push(get("hashtags"));

  return blocks.filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------
// AI enrichment endpoint
// ---------------------------------------------------------------------------

router.post("/enrich", async (req, res) => {
  const { name, price, category, notes } = req.body as {
    name?: string;
    price?: string;
    category?: string;
    notes?: string;
  };

  if (!name || !price || !category) {
    res.status(400).json({ error: "name, price, and category are required" });
    return;
  }

  // ---- Step 1: find the REAL product on the web first ----------------
  // Build a search query from exactly what the seller typed (product name +
  // their notes, e.g. brand/origin like "Rossiya", + category) so we look up
  // the actual item instead of something generic.
  const searchQuery = [name, notes, category].filter(Boolean).join(" ");
  const [webResults, images] = await Promise.all([
    searchProductWebInfo(searchQuery, 5),
    searchProductImages(`${name} product photo`, 6),
  ]);
  const webContext = formatWebContext(webResults);

  const systemPrompt = `You are an expert Uzbek e-commerce copywriter who writes premium Telegram channel posts in Uzbek language (use both Uzbek and some Russian/English words naturally as Uzbek sellers do).
You write posts that are engaging, use relevant emojis/stickers as bullet points, highlight value, and drive sales.
You are ALSO a careful researcher: before writing, you are given real web search results about this exact product. Ground every factual claim (specs, material, origin, typical use) in those search results. Only fall back to general category knowledge for a field when the search results say nothing relevant to it — never contradict what the search results say.
Always respond with a valid JSON object, no extra text.`;

  const userPrompt = `Product: "${name}"
Price: ${price} UZS
Category: ${category}
${notes ? `Seller notes: ${notes}` : ""}

${
  webContext
    ? `Real web search results about this exact product (use these as your source of truth for facts):\n${webContext}`
    : `No usable web search results were found for this product — write based on general knowledge of this product category, and keep specific claims (dimensions, weight, specs) conservative/typical rather than inventing precise details.`
}

Using the information above, return a JSON object with these exact keys:
{
  "marketPrice": "average market price in UZS as a formatted string, e.g. '380,000'",
  "priceDiff": "text like 'bozordan 8% arzon' or 'bozor narxida' comparing to market",
  "priceDiffPercent": number (positive = cheaper than market, negative = more expensive),
  "headline": "A short, punchy 1-line headline in Uzbek starting with a sparkle/fire emoji, mentioning the product name",
  "description": "2-3 sentence premium description of the product in Uzbek, grounded in the real product info found above, highlighting key benefits",
  "usageGuide": "3-4 practical usage tips in Uzbek, each on its own line starting with an emoji bullet",
  "dimensions": "actual/typical dimensions for this specific product (e.g. '15 x 8 x 3 sm')",
  "weight": "actual/typical weight (e.g. '320 g')",
  "extras": "2-3 category-specific technical specs or notable features found for this product, each on its own line with emoji bullets",
  "lifehacks": "2-3 useful lifehacks or pro tips for this product, each on its own line with emoji bullets",
  "hashtags": "3-5 relevant Uzbek/Russian hashtags separated by spaces, each starting with #, no other text"
}
Do not write a full post yourself — just fill in these fields, each field standalone. DO NOT include image captions.`;

  // ---- Step 2: AI writes the post using the grounded facts above -------
  let enrichedRawText: string;
  try {
    enrichedRawText = await generateText(systemPrompt, userPrompt);
  } catch (err) {
    console.error("Barcha AI provayderlar muvaffaqiyatsiz tugadi:", err);
    res.status(503).json({
      error:
        "AI xizmatlari hozir band yoki mavjud emas. Iltimos, bir necha daqiqadan so'ng qayta urinib ko'ring.",
    });
    return;
  }

  // Parse AI response
  let enriched: Record<string, unknown> = {};
  let postText = "";
  try {
    const parsed = JSON.parse(enrichedRawText) as Record<string, unknown>;
    enriched = {
      marketPrice: String(parsed.marketPrice ?? ""),
      priceDiff: String(parsed.priceDiff ?? ""),
      priceDiffPercent: Number(parsed.priceDiffPercent ?? 0),
      headline: String(parsed.headline ?? ""),
      description: String(parsed.description ?? ""),
      usageGuide: String(parsed.usageGuide ?? ""),
      dimensions: String(parsed.dimensions ?? ""),
      weight: String(parsed.weight ?? ""),
      extras: String(parsed.extras ?? ""),
      lifehacks: String(parsed.lifehacks ?? ""),
      hashtags: String(parsed.hashtags ?? ""),
    };
    postText = buildPostText(name, price, enriched);
  } catch {
    postText = `✨ ${name}\n\n💰 ${price} UZS\n\n📲 Buyurtma uchun yozing!`;
  }

  res.json({ postText, images, enriched });
});

export default router;
