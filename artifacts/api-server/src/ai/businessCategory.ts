import { generateText } from "./textProviders";

// Kept in sync by hand with CATEGORIES in artifacts/oneoffice-ai/src/App.tsx
// — this is the same fixed list products already use, so a business's
// AI-classified category and a product's (now optional) category line up.
export const BUSINESS_CATEGORIES = [
  "Electronics",
  "Fashion",
  "Home & Living",
  "Beauty",
  "Sports",
  "Toys",
] as const;

// ---------------------------------------------------------------------------
// Runs ONCE, right at sign-up, from whatever the person typed in the free-
// text "nima sotasiz?" field. Never re-asked, never re-run — the result is
// just stored on the user row (see users.category) and reused everywhere a
// default product category is needed.
// ---------------------------------------------------------------------------
export async function classifyBusinessCategory(
  hint: string,
  companyName: string,
): Promise<string> {
  const trimmed = hint.trim();
  if (!trimmed) return "";

  const systemPrompt = `You classify a small business into exactly one category from this fixed list: ${BUSINESS_CATEGORIES.join(", ")}.
Respond with ONLY a JSON object: {"category": "<one exact value from the list>"}.
Pick the single best match. Never invent a category outside the list.`;

  const userPrompt = `Business name: ${companyName}\nWhat they said they sell: ${trimmed}`;

  try {
    const raw = await generateText(systemPrompt, userPrompt);
    const parsed = JSON.parse(raw) as { category?: unknown };
    const category = String(parsed.category ?? "");
    return (BUSINESS_CATEGORIES as readonly string[]).includes(category)
      ? category
      : "";
  } catch {
    // Best-effort — an empty category just means new products fall back to
    // no default instead of a wrong one; never blocks sign-up on this.
    return "";
  }
}
