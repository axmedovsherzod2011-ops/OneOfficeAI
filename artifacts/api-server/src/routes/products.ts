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
    description: p.description,
    images: p.images,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
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

  const { name, category, costPrice, sellPrice, description, images, status } =
    parsed.data;

  const [product] = await db
    .insert(productsTable)
    .values({
      userId,
      name: name ?? "",
      category: category ?? "Electronics",
      costPrice: costPrice ?? "",
      sellPrice: sellPrice ?? "",
      description: description ?? "",
      images: images ?? [],
      status: status ?? "draft",
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
