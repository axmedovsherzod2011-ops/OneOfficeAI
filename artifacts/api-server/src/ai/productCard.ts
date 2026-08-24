import { generateText } from "./textProviders";
import {
  searchProductWebInfo,
  searchProductImages,
  formatWebContext,
  type WebSnippet,
  type DdgImage,
} from "./webSearch";

// ---------------------------------------------------------------------------
// "Professional Product Card" — the one-time deep-research result for a
// single product. Built ONCE per product (cached in product_research), then
// reused for every post generated for that product afterwards. This is what
// makes the AI stop rewriting the same product from scratch on every post
// (saves both tokens and the seconds-long wait).
//
// The card carries THREE separate copy variants on purpose, because a
// product needs different words depending on where it's shown:
//   - search*   -> what helps people FIND it (SEO title + keywords)
//   - viewHook  -> what makes someone stop scrolling and look
//   - buy*      -> what actually convinces someone to purchase
// plus the existing market-price/specs fields the post text is built from.
// ---------------------------------------------------------------------------

export interface ProductCard {
  // Market / pricing
  marketPrice: string;
  priceDiff: string;
  priceDiffPercent: number;
  // Core specs (existing fields, kept for backward compatibility with the
  // single-shot /enrich flow and the current post-text builder)
  headline: string;
  description: string;
  usageGuide: string;
  dimensions: string;
  weight: string;
  extras: string;
  lifehacks: string;
  hashtags: string;
  // Search / View / Buy triad — the new part
  searchTitle: string; // SEO/qidiruv uchun optimallashtirilgan nom
  searchKeywords: string; // qidiruvda topilishi uchun kalit so'zlar
  viewHook: string; // e'tibor tortadigan, "to'xtat va qara" jumlasi
  buyHeadline: string; // xarid bosqichida ishonch beruvchi sarlavha
  buyCta: string; // kuchli, shoshiltiruvchi harakatga chaqiruv
  popularNames: string[]; // internetda topilgan eng ko'p ishlatiladigan/viral nomlar
}

export interface ProductSource {
  title: string;
  url: string;
}

const DEFAULT_CARD: ProductCard = {
  marketPrice: "",
  priceDiff: "",
  priceDiffPercent: 0,
  headline: "",
  description: "",
  usageGuide: "",
  dimensions: "",
  weight: "",
  extras: "",
  lifehacks: "",
  hashtags: "",
  searchTitle: "",
  searchKeywords: "",
  viewHook: "",
  buyHeadline: "",
  buyCta: "",
  popularNames: [],
};

// Marketplaces/platforms we specifically check for how this exact product is
// named and sold elsewhere — this is the "(biz tanlaymiz) saytlar" part: a
// curated set instead of an unbounded crawl. Mixes O'zbek marketplaces with
// the regional/global ones Uzbek sellers actually source from.
const CURATED_SOURCES = [
  "uzum.uz",
  "olcha.uz",
  "texnomart.uz",
  "asaxiy.uz",
  "ozon.uz",
  "aliexpress.com",
];

interface ResearchInput {
  name: string;
  price: string;
  category: string;
  notes?: string;
}

// Dedupe search hits by domain so the AI context isn't dominated by 5 near-
// identical results from the same site, and cap the total so the prompt
// stays within a sane token budget.
function dedupeByDomain(snippets: WebSnippet[], limit: number): WebSnippet[] {
  const seen = new Set<string>();
  const out: WebSnippet[] = [];
  for (const s of snippets) {
    let domain = s.source;
    try {
      domain = new URL(s.source).hostname.replace(/^www\./, "");
    } catch {
      // keep raw source as the dedupe key if it isn't a real URL
    }
    if (!s.title && !s.snippet) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The one-time deep research pass: several targeted searches (general +
// reviews + virality signal + curated marketplaces) feed a single AI call
// that returns the full Professional Product Card.
// ---------------------------------------------------------------------------

export interface ResearchResult {
  card: ProductCard;
  sources: ProductSource[];
  // First batch of gallery images found during research. Not cached in
  // product_research (images are cheap to re-search and go stale), but
  // handed back so the caller can show something immediately on a fresh
  // (non-cached) research run.
  images: DdgImage[];
}

export async function runProductResearch(input: ResearchInput): Promise<ResearchResult> {
  const { name, price, category, notes } = input;

  const baseQuery = [name, notes, category].filter(Boolean).join(" ");
  const queries = [
    baseQuery,
    `${name} sharh review`,
    `${name} narxi price`,
    `${name} tiktok instagram`,
    ...CURATED_SOURCES.map((site) => `site:${site} ${name}`),
  ];

  const [resultsPerQuery, images] = await Promise.all([
    Promise.all(queries.map((q) => searchProductWebInfo(q, 3))),
    searchProductImages(`${name} product photo`, 8),
  ]);

  const allSnippets = resultsPerQuery.flat();
  const deduped = dedupeByDomain(allSnippets, 15);
  const webContext = formatWebContext(deduped);
  const sources: ProductSource[] = deduped
    .filter((s) => s.source)
    .map((s) => ({ title: s.title || s.source, url: s.source }));

  const systemPrompt = `You are an expert Uzbek e-commerce researcher AND copywriter. You are given real web search results gathered from general search plus several curated marketplaces (Uzum, Olcha, Texnomart, Asaxiy, Ozon, AliExpress) about one specific product.
Your job has two parts:
1. RESEARCH — read the search results and identify how this exact product is actually named/marketed across those sources (the wording sellers/reviewers/viral posts actually use), real specs, and a realistic market price.
2. WRITE — produce a "Professional Product Card": separate copy for three different moments — when someone SEARCHES for this product, when someone just VIEWS/scrolls past it, and when someone is deciding to BUY it. Each needs different words: search copy is literal and keyword-rich, view copy is a scroll-stopping hook, buy copy is persuasive and creates urgency/value.
Ground every factual claim in the search results given to you. Only rely on general category knowledge where the search results say nothing relevant — never contradict what they say. Write in Uzbek (mixing in Russian/English words the way real Uzbek sellers do).
Always respond with a single valid JSON object, no extra text.`;

  const userPrompt = `Product: "${name}"
Price: ${price} UZS
Category: ${category}
${notes ? `Seller notes: ${notes}` : ""}

${
  webContext
    ? `Real web search results about this exact product, gathered from general search + curated marketplaces + review/virality signals:\n${webContext}`
    : `No usable web search results were found for this product — write based on general knowledge of this product category, and keep specific claims (dimensions, weight, specs) conservative/typical rather than inventing precise details.`
}

Return a JSON object with these exact keys:
{
  "marketPrice": "average market price in UZS as a formatted string, e.g. '380,000'",
  "priceDiff": "text like 'bozordan 8% arzon' or 'bozor narxida' comparing to market",
  "priceDiffPercent": number (positive = cheaper than market, negative = more expensive),
  "headline": "A short, punchy 1-line headline in Uzbek starting with a sparkle/fire emoji, mentioning the product name",
  "description": "2-3 sentence premium description of the product in Uzbek, grounded in the real product info found above",
  "usageGuide": "3-4 practical usage tips in Uzbek, each on its own line starting with an emoji bullet",
  "dimensions": "actual/typical dimensions for this specific product (e.g. '15 x 8 x 3 sm')",
  "weight": "actual/typical weight (e.g. '320 g')",
  "extras": "2-3 category-specific technical specs or notable features found for this product, each on its own line with emoji bullets",
  "lifehacks": "2-3 useful lifehacks or pro tips for this product, each on its own line with emoji bullets",
  "hashtags": "3-5 relevant Uzbek/Russian hashtags separated by spaces, each starting with #, no other text",
  "searchTitle": "the clearest, most literal, keyword-first version of this product's name — what someone would actually type into a search box",
  "searchKeywords": "5-8 comma-separated search keywords/phrases people use to find this exact product",
  "viewHook": "ONE short scroll-stopping sentence in Uzbek (with emoji) designed to grab attention in a feed — not a sales pitch, just a hook",
  "buyHeadline": "a short, confidence-building headline in Uzbek used at the moment of deciding to buy (trust/value framing, not just excitement)",
  "buyCta": "one strong, urgency/value-driven call-to-action line in Uzbek telling the reader exactly how to order now",
  "popularNames": ["array of 2-5 short strings — the actual product name variants/phrasings you saw repeated across the search results (skip this array entirely, i.e. return [], if the results didn't give you real variants — never invent them)"]
}
Do not write a full post yourself — just fill in these fields, each standalone.`;

  const raw = await generateText(systemPrompt, userPrompt);
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  const card: ProductCard = {
    ...DEFAULT_CARD,
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
    searchTitle: String(parsed.searchTitle ?? ""),
    searchKeywords: String(parsed.searchKeywords ?? ""),
    viewHook: String(parsed.viewHook ?? ""),
    buyHeadline: String(parsed.buyHeadline ?? ""),
    buyCta: String(parsed.buyCta ?? ""),
    popularNames: Array.isArray(parsed.popularNames)
      ? parsed.popularNames.map((n) => String(n)).filter(Boolean).slice(0, 5)
      : [],
  };

  return { card, sources, images };
}

// ---------------------------------------------------------------------------
// Builds the final Telegram post text from a card. Each section is only
// added if the card actually has it, separated by a blank line so Telegram
// renders clear paragraph breaks. Prefers the buy-stage headline/CTA when
// present (they're written specifically to convert), falling back to the
// generic headline/CTA otherwise — so this works unchanged for cards that
// pre-date the search/view/buy fields.
// ---------------------------------------------------------------------------

export function buildPostText(name: string, price: string, card: Partial<ProductCard>): string {
  const get = (key: keyof ProductCard) => String((card as Record<string, unknown>)[key] ?? "").trim();

  const blocks: string[] = [];

  blocks.push(get("buyHeadline") || get("headline") || `✨ ${name}`);

  if (get("description")) blocks.push(get("description"));

  if (get("extras")) blocks.push(`🔧 Xususiyatlar:\n${get("extras")}`);

  if (get("usageGuide")) blocks.push(`🎯 Ishlatish bo'yicha maslahat:\n${get("usageGuide")}`);

  const dims = [get("dimensions") ? `📐 ${get("dimensions")}` : "", get("weight") ? `⚖️ ${get("weight")}` : ""]
    .filter(Boolean)
    .join("   ");
  if (dims) blocks.push(dims);

  if (get("lifehacks")) blocks.push(`💡 Lifehack:\n${get("lifehacks")}`);

  const priceDiff = get("priceDiff");
  blocks.push(priceDiff ? `💰 ${price} UZS (${priceDiff})` : `💰 ${price} UZS`);

  blocks.push(get("buyCta") || "📲 Buyurtma uchun yozing!");

  if (get("hashtags")) blocks.push(get("hashtags"));

  return blocks.filter(Boolean).join("\n\n");
}
