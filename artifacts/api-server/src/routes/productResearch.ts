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
    });

    await db
      .insert(productResearchTable)
      .values({ productId: id, userId, card, sources })
      .onConflictDoUpdate({
        target: productResearchTable.productId,
        set: { card, sources, status: "ready", updatedAt: new Date() },
      });

    res.json({ cached: false, card, sources, images });
  } catch (err) {
    console.error("Product research failed:", err);
    res.status(503).json({
      error: "AI xizmatlari hozir band yoki mavjud emas. Iltimos, bir necha daqiqadan so'ng qayta urinib ko'ring.",
    });
  }
});

export default router;
