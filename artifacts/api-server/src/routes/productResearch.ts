import { Router } from "express";
import { db } from "@workspace/db";
import { productResearchTable, productsTable, usersTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { runProductResearch } from "../ai/productCard";

const router = Router();

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
// GET /products/:id/research — fetch the cached Professional Product Card
// without triggering any AI/search work. 404 if it hasn't been researched
// yet (frontend uses this to decide whether to show a "Tahlil qilingan" vs
// "Hali tahlil qilinmagan" state, and whether to offer a refresh button).
// ---------------------------------------------------------------------------

router.get("/products/:id/research", async (req, res) => {
  const userId = await getCurrentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const [product] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(and(eq(productsTable.id, id), eq(productsTable.userId, userId)))
    .limit(1);

  if (!product) {
    res.status(404).json({ error: "Mahsulot topilmadi." });
    return;
  }

  const [research] = await db
    .select()
    .from(productResearchTable)
    .where(eq(productResearchTable.productId, id))
    .limit(1);

  if (!research) {
    res.status(404).json({ error: "Bu mahsulot hali tahlil qilinmagan." });
    return;
  }

  res.json({
    card: research.card,
    sources: research.sources,
    researchedAt: research.updatedAt.toISOString(),
  });
});

// ---------------------------------------------------------------------------
// POST /products/:id/research — run (or force-refresh) the one-time deep
// research pass for a product and cache the result. Every post generated
// for this product afterwards (via POST /enrich with this productId) reuses
// this cached card instead of calling the AI again.
//
// Without ?force=true, an existing cached row is returned as-is (idempotent
// — calling this twice by accident costs nothing the second time).
// ---------------------------------------------------------------------------

router.post("/products/:id/research", async (req, res) => {
  const userId = await getCurrentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, id), eq(productsTable.userId, userId)))
    .limit(1);

  if (!product) {
    res.status(404).json({ error: "Mahsulot topilmadi." });
    return;
  }

  const force = req.query.force === "true";

  if (!force) {
    const [existing] = await db
      .select()
      .from(productResearchTable)
      .where(eq(productResearchTable.productId, id))
      .limit(1);

    if (existing && existing.status === "ready") {
      res.json({
        cached: true,
        card: existing.card,
        sources: existing.sources,
        researchedAt: existing.updatedAt.toISOString(),
      });
      return;
    }
  }

  if (!product.name || !product.sellPrice) {
    res.status(400).json({
      error: "Tahlil qilishdan oldin mahsulotning nomi va narxi to'ldirilgan bo'lishi kerak.",
    });
    return;
  }

  try {
    const { card, sources, images } = await runProductResearch({
      name: product.name,
      price: product.sellPrice,
      category: product.category,
      notes: product.description,
      imageUrl: product.images?.[0],
    });

    await db
      .insert(productResearchTable)
      .values({ productId: id, userId, card: card as unknown as Record<string, unknown>, sources })
      .onConflictDoUpdate({
        target: productResearchTable.productId,
        set: { card: card as unknown as Record<string, unknown>, sources, status: "ready", updatedAt: new Date() },
      });

    res.json({ cached: false, card, sources, images });
  } catch (err) {
    console.error("Product research failed:", err);
    res.status(503).json({
      error: "AI xizmatlari hozir band yoki mavjud emas. Iltimos, bir necha daqiqadan so'ng qayta urinib ko'ring.",
    });
  }
});

// ---------------------------------------------------------------------------
// PATCH /products/:id/research — lets the seller edit the copy fields of an
// already-researched card by hand (searchTitle, searchKeywords, viewHook,
// buyHeadline, buyCta, popularNames). The AI-found market data (marketPrice,
// specs, sources) is left as the AI found it — only the copy the AI wrote
// is meant to be human-editable here. Every post generated afterwards reads
// this same cached row, so an edit here is what shows up in the next post,
// with no re-research needed.
// ---------------------------------------------------------------------------

const EDITABLE_CARD_FIELDS = [
  "searchTitle",
  "searchKeywords",
  "viewHook",
  "buyHeadline",
  "buyCta",
  "popularNames",
] as const;

router.patch("/products/:id/research", async (req, res) => {
  const userId = await getCurrentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const [existing] = await db
    .select()
    .from(productResearchTable)
    .where(and(eq(productResearchTable.productId, id), eq(productResearchTable.userId, userId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Bu mahsulot hali tahlil qilinmagan." });
    return;
  }

  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE_CARD_FIELDS) {
    if (!(field in (req.body ?? {}))) continue;
    const value = (req.body as Record<string, unknown>)[field];
    if (field === "popularNames") {
      if (!Array.isArray(value)) {
        res.status(400).json({ error: "popularNames ro'yxat (array) bo'lishi kerak." });
        return;
      }
      patch[field] = value.map((v) => String(v)).filter(Boolean).slice(0, 5);
    } else {
      if (typeof value !== "string") {
        res.status(400).json({ error: `${field} matn (string) bo'lishi kerak.` });
        return;
      }
      patch[field] = value;
    }
  }

  const updatedCard = { ...(existing.card as Record<string, unknown>), ...patch };

  await db
    .update(productResearchTable)
    .set({ card: updatedCard, updatedAt: new Date() })
    .where(eq(productResearchTable.id, existing.id));

  res.json({ card: updatedCard, sources: existing.sources, researchedAt: new Date().toISOString() });
});

export default router;
