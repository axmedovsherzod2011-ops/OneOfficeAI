import { Router } from "express";
import { Modality } from "@google/genai";
import { db } from "@workspace/db";
import { productResearchTable, productsTable, usersTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { geminiAi, IMAGE_MODEL, generateText, withRetry, fetchImageBuffer } from "../ai/textProviders";
import { searchProductImages, searchProductWebInfo, formatWebContext } from "../ai/webSearch";
import { runProductResearch, buildPostText, type ProductCard } from "../ai/productCard";

const router = Router();

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
    res.status(400).json({ error: "referenceUrl and productName are required" });
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
      (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData,
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
      error: "Rasm generatsiya xizmati hozir band. Birozdan so'ng qayta urinib ko'ring.",
    });
  }
});

// ---------------------------------------------------------------------------
// Looks up the internal numeric user row for whoever's Firebase ID token
// came in on this request. Mirrors routes/products.ts.
// ---------------------------------------------------------------------------

async function getCurrentUserId(req: Parameters<typeof getAuth>[0]) {
  const { userId: firebaseUid } = getAuth(req);
  if (!firebaseUid) return null;

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.firebaseUid, firebaseUid))
    .limit(1);

  return user?.id ?? null;
}

// ---------------------------------------------------------------------------
// AI enrichment endpoint
//
// Token-saving path: when the request is for a saved inventory product
// (productId given), we check product_research first. If that product was
// already deep-researched — by a previous post, or by an explicit
// POST /products/:id/research call — we build the post straight from the
// cached card: NO AI call, NO web search, just string formatting. Every
// re-post of the same product after the first one is free and instant.
//
// If there's no cache yet for that product, we run the full one-time
// research pass now (same one POST /products/:id/research uses) and cache
// it, so the NEXT post for this product is the fast/free path.
//
// Ad-hoc posts with no productId (quick drafts not tied to inventory) keep
// the old single-shot, uncached behavior — nothing to key a cache off of.
// ---------------------------------------------------------------------------

router.post("/enrich", async (req, res) => {
  const { name, price, category, notes, productId } = req.body as {
    name?: string;
    price?: string;
    category?: string;
    notes?: string;
    productId?: number;
  };

  if (!name || !price || !category) {
    res.status(400).json({ error: "name, price, and category are required" });
    return;
  }

  // ---- Cached path: this product was already deep-researched ----------
  if (productId) {
    const userId = await getCurrentUserId(req);
    if (userId) {
      const [product] = await db
        .select()
        .from(productsTable)
        .where(and(eq(productsTable.id, productId), eq(productsTable.userId, userId)))
        .limit(1);

      if (product) {
        const [cached] = await db
          .select()
          .from(productResearchTable)
          .where(eq(productResearchTable.productId, productId))
          .limit(1);

        if (cached && cached.status === "ready") {
          const card = cached.card as unknown as ProductCard;
          const postText = buildPostText(name, price, card, product.deliveryInfo);
          res.json({
            postText,
            images: [], // product's own saved images (product.images) are shown by the frontend directly
            enriched: card,
            cached: true,
          });
          return;
        }

        // No cache yet for this product — run the research ONCE now and
        // cache it, so every future post for this product is the free path
        // above.
        try {
          const { card, sources, images } = await runProductResearch({
            name,
            price,
            category,
            notes,
            imageUrl: product.images?.[0],
          });

          await db
            .insert(productResearchTable)
            .values({ productId, userId, card, sources })
            .onConflictDoUpdate({
              target: productResearchTable.productId,
              set: { card, sources, status: "ready", updatedAt: new Date() },
            });

          const postText = buildPostText(name, price, card, product.deliveryInfo);
          res.json({ postText, images, enriched: card, cached: false });
          return;
        } catch (err) {
          console.error("Product research failed:", err);
          res.status(503).json({
            error: "AI xizmatlari hozir band yoki mavjud emas. Iltimos, bir necha daqiqadan so'ng qayta urinib ko'ring.",
          });
          return;
        }
      }
    }
    // productId given but couldn't be resolved to this user's product
    // (bad id, not signed in, etc.) — fall through to the uncached path
    // below rather than failing the whole request.
  }

  // ---- Uncached path: ad-hoc product, not tied to inventory ------------
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

  let enrichedRawText: string;
  try {
    enrichedRawText = await generateText(systemPrompt, userPrompt);
  } catch (err) {
    console.error("Barcha AI provayderlar muvaffaqiyatsiz tugadi:", err);
    res.status(503).json({
      error: "AI xizmatlari hozir band yoki mavjud emas. Iltimos, bir necha daqiqadan so'ng qayta urinib ko'ring.",
    });
    return;
  }

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
    postText = buildPostText(name, price, enriched as Partial<ProductCard>);
  } catch {
    postText = `✨ ${name}\n\n💰 ${price} UZS\n\n📲 Buyurtma uchun yozing!`;
  }

  res.json({ postText, images, enriched, cached: false });
});

export default router;
