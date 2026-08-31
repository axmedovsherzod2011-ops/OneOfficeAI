import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, productsTable } from "@workspace/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  ListProductsQueryParams,
  CreateProductBody,
  UpdateProductBody,
} from "@workspace/api-zod";
import { generateText } from "../ai/textProviders";

const router = Router();

// Looks up the internal numeric user row for whoever's Firebase ID token
// came in on this request. Every route below is scoped to this id, so one
// user can never read/edit/delete another user's products.
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

function serializeProduct(p: typeof productsTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    costPrice: p.costPrice,
    sellPrice: p.sellPrice,
    currency: p.currency,
    description: p.description,
    images: p.images,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    // Seller-entered spec table — stays a real product column.
    characteristics: p.characteristics,
    // Composition ("Tarkib/Sostav") and usage instructions are NOT read
    // from here — they live in product_research.card, the one-time
    // AI+web-search pass. GET /api/store/:slug joins that in for the
    // public storefront; this seller-facing endpoint doesn't need them
    // since ProductForm's "AI card" panel fetches research separately.
    deliveryInfo: p.deliveryInfo,
  };
}

// ---------------------------------------------------------------------------
// GET /products?status=draft|active — list the signed-in user's inventory,
// newest first. Omit `status` to get everything (used for the "All" filter
// in Inventory).
// ---------------------------------------------------------------------------

router.get("/products", async (req, res) => {
  const userId = await getCurrentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return;
  }

  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const conditions = [eq(productsTable.userId, userId)];
  if (parsed.data.status) {
    conditions.push(eq(productsTable.status, parsed.data.status));
  }

  const products = await db
    .select()
    .from(productsTable)
    .where(and(...conditions))
    .orderBy(desc(productsTable.createdAt));

  res.json(products.map(serializeProduct));
});

// ---------------------------------------------------------------------------
// POST /products — create a product. Saving from the New Product form as a
// draft (incomplete fields ok) or as a finished product both hit this same
// endpoint — the only difference is the `status` field.
//
// Delivery info: if the caller didn't send an explicit deliveryInfo AND
// this seller already has a saved default (from a previous "barcha
// mahsulotlarga saqlash" choice — see POST /products/:id/delivery-info
// below), it's applied here immediately. The frontend checks the returned
// product's deliveryInfo: non-empty means "already handled, recalled the
// saved default, don't ask again"; empty means "first time, show the
// delivery modal".
// ---------------------------------------------------------------------------

router.post("/products", async (req, res) => {
  const userId = await getCurrentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return;
  }

  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { name, category, costPrice, sellPrice, currency, description, images, status, characteristics, deliveryInfo } =
    parsed.data;

  // Category is optional per-product now — a blank one falls back to the
  // seller's own business category (set once, by AI, at sign-up) instead
  // of a hardcoded guess. Same one query covers both that and delivery
  // info below.
  const [user] = await db
    .select({
      defaultDeliveryInfo: usersTable.defaultDeliveryInfo,
      businessCategory: usersTable.category,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  let effectiveDeliveryInfo = deliveryInfo ?? "";
  if (!effectiveDeliveryInfo) {
    effectiveDeliveryInfo = user?.defaultDeliveryInfo ?? "";
  }

  const [product] = await db
    .insert(productsTable)
    .values({
      userId,
      name: name ?? "",
      category: category || user?.businessCategory || "",
      costPrice: costPrice ?? "",
      sellPrice: sellPrice ?? "",
      currency: currency ?? "UZS",
      description: description ?? "",
      images: images ?? [],
      status: status ?? "draft",
      characteristics: characteristics ?? [],
      deliveryInfo: effectiveDeliveryInfo,
    })
    .returning();

  res.json(serializeProduct(product));
});

// ---------------------------------------------------------------------------
// PATCH /products/:id — partial update (edit fields, or flip a draft to
// active). Only the owning user may edit their own product.
// ---------------------------------------------------------------------------

router.patch("/products/:id", async (req, res) => {
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

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(productsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(productsTable.id, id), eq(productsTable.userId, userId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Mahsulot topilmadi." });
    return;
  }

  res.json(serializeProduct(updated));
});

// ---------------------------------------------------------------------------
// POST /products/:id/delivery-info — the "smart delivery" step shown in a
// modal right after a product is created. The seller types delivery info
// in their own words; that raw text is rewritten into clean storefront copy
// by AI before saving (the seller never sees this as an "AI step" — it just
// looks like their text got saved, polished).
//
// scope:
//   "this"  — apply the polished text to this product only.
//   "all"   — apply it to this product AND save it as this seller's default
//             (users.defaultDeliveryInfo), so POST /products above silently
//             reuses it for every future product — no modal, no re-asking,
//             no re-generating, exactly the recall behavior asked for.
//   "skip"  — leave this product's deliveryInfo empty. rawText not required.
// ---------------------------------------------------------------------------

router.post("/products/:id/delivery-info", async (req, res) => {
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

  const { rawText, scope } = req.body as { rawText?: string; scope?: string };
  if (scope !== "this" && scope !== "all" && scope !== "skip") {
    res.status(400).json({ error: "scope 'this', 'all' yoki 'skip' bo'lishi kerak." });
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

  if (scope === "skip") {
    res.json({ deliveryInfo: "" });
    return;
  }

  const trimmedRaw = (rawText ?? "").trim();
  if (!trimmedRaw) {
    res.status(400).json({ error: "Yetkazib berish haqida matn kiriting." });
    return;
  }

  let polished: string;
  try {
    polished = await generateText(
      "You turn a seller's rough, informally-written delivery/shipping note into clean, professional storefront copy in Uzbek. Keep every concrete fact the seller gave (timeframes, regions/cities, cost, conditions) — never invent new facts, never drop any they gave. Just rewrite it clearly and politely, 1-4 short sentences or short bullet lines. Plain text only, no markdown, no quotes, no preamble.",
      `Seller's raw note about delivery:\n"${trimmedRaw}"`,
    );
    polished = polished.trim();
  } catch (err) {
    console.error("Delivery info polish failed, saving the seller's raw text as-is:", err);
    polished = trimmedRaw;
  }

  await db
    .update(productsTable)
    .set({ deliveryInfo: polished, updatedAt: new Date() })
    .where(and(eq(productsTable.id, id), eq(productsTable.userId, userId)));

  if (scope === "all") {
    await db
      .update(usersTable)
      .set({ defaultDeliveryInfo: polished })
      .where(eq(usersTable.id, userId));
  }

  res.json({ deliveryInfo: polished });
});

// ---------------------------------------------------------------------------
// DELETE /products/:id
// ---------------------------------------------------------------------------

router.delete("/products/:id", async (req, res) => {
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

  const [deleted] = await db
    .delete(productsTable)
    .where(and(eq(productsTable.id, id), eq(productsTable.userId, userId)))
    .returning({ id: productsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Mahsulot topilmadi." });
    return;
  }

  res.json({ success: true });
});

export default router;
