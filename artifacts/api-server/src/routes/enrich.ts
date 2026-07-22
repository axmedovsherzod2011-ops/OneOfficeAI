import { Router } from "express";
import OpenAI from "openai";

const router = Router();

// ---------------------------------------------------------------------------
// DuckDuckGo image search (no API key required)
// ---------------------------------------------------------------------------

interface DdgImage {
  url: string;
  thumbnail: string;
  title: string;
  source: string;
}

async function searchProductImages(query: string, count = 6): Promise<DdgImage[]> {
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
      }
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

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Run AI enrichment and image search in parallel
  const [enrichedRaw, images] = await Promise.all([
    // ---- OpenAI enrichment ----
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1500,
      messages: [
        {
          role: "system",
          content: `You are an expert Uzbek e-commerce copywriter who writes premium Telegram channel posts in Uzbek language (use both Uzbek and some Russian/English words naturally as Uzbek sellers do).
You write posts that are engaging, use relevant emojis/stickers as bullet points, highlight value, and drive sales.
Always respond with a valid JSON object, no extra text.`,
        },
        {
          role: "user",
          content: `Product: "${name}"
Price: ${price} UZS
Category: ${category}
${notes ? `Seller notes: ${notes}` : ""}

Return a JSON object with these exact keys:
{
  "marketPrice": "average market price in UZS as a formatted string, e.g. '380,000'",
  "priceDiff": "text like 'bozordan 8% arzon' or 'bozor narxida' comparing to market",
  "priceDiffPercent": number (positive = cheaper than market, negative = more expensive),
  "description": "2-3 sentence premium description of the product in Uzbek, highlight key benefits",
  "usageGuide": "3-4 practical usage tips in Uzbek, each starting with an emoji bullet",
  "dimensions": "typical dimensions for this product type (e.g. '15 x 8 x 3 sm')",
  "weight": "typical weight (e.g. '320 g')",
  "extras": "2-3 category-specific technical specs or notable features with emoji bullets",
  "lifehacks": "2-3 useful lifehacks or pro tips for this product with emoji bullets",
  "postText": "Full premium Telegram post text in Uzbek. Must include: product name with sparkle emoji, short punchy headline, key benefits with emoji bullets (✅ or 🔥 or ⚡), price highlighted with 💰, market comparison, call to action with 👇 or 📲, relevant hashtags. Use line breaks. Be exciting and persuasive. DO NOT include image captions."
}`,
        },
      ],
      response_format: { type: "json_object" },
    }),
    // ---- Image search ----
    searchProductImages(`${name} product photo`, 6),
  ]);

  // Parse AI response
  let enriched: Record<string, unknown> = {};
  let postText = "";
  try {
    const parsed = JSON.parse(enrichedRaw.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
    postText = String(parsed.postText ?? "");
    enriched = {
      marketPrice: String(parsed.marketPrice ?? ""),
      priceDiff: String(parsed.priceDiff ?? ""),
      priceDiffPercent: Number(parsed.priceDiffPercent ?? 0),
      description: String(parsed.description ?? ""),
      usageGuide: String(parsed.usageGuide ?? ""),
      dimensions: String(parsed.dimensions ?? ""),
      weight: String(parsed.weight ?? ""),
      extras: String(parsed.extras ?? ""),
      lifehacks: String(parsed.lifehacks ?? ""),
    };
  } catch {
    postText = `✨ ${name}\n\n💰 ${price} UZS\n\n📲 Buyurtma uchun yozing!`;
  }

  res.json({ postText, images, enriched });
});

export default router;
