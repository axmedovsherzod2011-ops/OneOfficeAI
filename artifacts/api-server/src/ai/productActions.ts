import { db } from "@workspace/db";
import { productsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

export type ProductActionResult = { ok: true; message: string } | { ok: false; error: string };

async function findProductByName(userId: number, name: string) {
  const products = await db.select().from(productsTable).where(eq(productsTable.userId, userId));
  const needle = name.trim().toLowerCase();
  return products.find((p) => p.name.toLowerCase().includes(needle));
}

// Creates a product directly (skips the New Product form entirely) —
// status defaults to "draft" unless the person clearly wants it live
// right away, since a draft is the safe/reversible default and nothing
// public-facing happens until it's flipped to active.
export async function createProductViaOneHelp(
  userId: number,
  input: {
    name: string;
    category?: string;
    sellPrice?: string;
    costPrice?: string;
    description?: string;
    active?: boolean;
  },
): Promise<ProductActionResult> {
  if (!input.name?.trim()) return { ok: false, error: "Mahsulot nomi kerak." };
  try {
    await db.insert(productsTable).values({
      userId,
      name: input.name.trim(),
      category: input.category?.trim() || "Electronics",
      sellPrice: input.sellPrice?.trim() || "",
      costPrice: input.costPrice?.trim() || "",
      description: input.description?.trim() || "",
      status: input.active ? "active" : "draft",
    });
    return { ok: true, message: `"${input.name.trim()}" mahsuloti yaratildi.` };
  } catch (err) {
    console.error("[onehelp] createProductViaOneHelp failed", err);
    return { ok: false, error: "Mahsulot yaratishda xatolik yuz berdi." };
  }
}

// Finds a product by (fuzzy) name and applies whichever fields were given
// — omitted fields are left untouched. "active: true/false" flips
// draft<->active (e.g. "X mahsulotini nashr qil" / "yashirib qo'y").
export async function updateProductViaOneHelp(
  userId: number,
  productName: string,
  changes: {
    sellPrice?: string;
    costPrice?: string;
    description?: string;
    category?: string;
    active?: boolean;
  },
): Promise<ProductActionResult> {
  const product = await findProductByName(userId, productName);
  if (!product) return { ok: false, error: `"${productName}" nomli mahsulot topilmadi.` };

  const set: Partial<typeof productsTable.$inferInsert> = { updatedAt: new Date() };
  if (changes.sellPrice !== undefined) set.sellPrice = changes.sellPrice;
  if (changes.costPrice !== undefined) set.costPrice = changes.costPrice;
  if (changes.description !== undefined) set.description = changes.description;
  if (changes.category !== undefined) set.category = changes.category;
  if (changes.active !== undefined) set.status = changes.active ? "active" : "draft";

  try {
    await db
      .update(productsTable)
      .set(set)
      .where(and(eq(productsTable.id, product.id), eq(productsTable.userId, userId)));
    return { ok: true, message: `"${product.name}" yangilandi.` };
  } catch (err) {
    console.error("[onehelp] updateProductViaOneHelp failed", err);
    return { ok: false, error: "Yangilashda xatolik yuz berdi." };
  }
}

export async function deleteProductViaOneHelp(
  userId: number,
  productName: string,
): Promise<ProductActionResult> {
  const product = await findProductByName(userId, productName);
  if (!product) return { ok: false, error: `"${productName}" nomli mahsulot topilmadi.` };

  try {
    await db
      .delete(productsTable)
      .where(and(eq(productsTable.id, product.id), eq(productsTable.userId, userId)));
    return { ok: true, message: `"${product.name}" o'chirildi.` };
  } catch (err) {
    console.error("[onehelp] deleteProductViaOneHelp failed", err);
    return { ok: false, error: "O'chirishda xatolik yuz berdi." };
  }
}
