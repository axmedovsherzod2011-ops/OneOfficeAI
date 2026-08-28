import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// A product in the user's inventory. Created either as a full product
// (status "active") or saved mid-way as a "draft" from the New Product
// form. Create Post reads from here — the person picks a product and the
// AI writes copy for it using the product's own name/prices/description
// and publishes using the product's own images.
export const PRODUCT_STATUSES = ["draft", "active"] as const;

// Currency the product's prices are entered in. UZS stays the default so
// existing products (created before this field existed) keep behaving the
// same way.
export const PRODUCT_CURRENCIES = ["USD", "UZS", "RUB"] as const;

// One spec row in the storefront's "Xarakteristika" table, e.g.
// {label: "Rang", value: "Qora"}. Free-form on purpose — sellers sell
// everything from electronics to food, so a fixed spec schema per
// category isn't realistic here; this is the same approach Uzum's own
// seller-supplied characteristics use.
export type ProductCharacteristic = { label: string; value: string };

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  // Same fixed list the create-post flow already used (Electronics,
  // Fashion, Home & Living, Beauty, Sports, Toys). Chosen once here at
  // product-creation time — Create Post now just inherits it instead of
  // asking again.
  category: text("category").notNull().default("Electronics"),
  // Kept as text (not numeric) to match the existing posts.price pattern —
  // preserves whatever formatting the user typed, no currency parsing.
  costPrice: text("cost_price").notNull().default(""),
  sellPrice: text("sell_price").notNull().default(""),
  currency: text("currency", { enum: PRODUCT_CURRENCIES })
    .notNull()
    .default("UZS"),
  description: text("description").notNull().default(""),
  // Uploaded image URLs, in display order. Empty until at least one image
  // is attached.
  images: jsonb("images").$type<string[]>().notNull().default([]),
  // The seller-editable spec table ("Xarakteristika") shown on the
  // storefront product page — free-form on purpose, since sellers here
  // range from electronics to food and a fixed spec schema per category
  // isn't realistic. NOT auto-researched like composition/usageGuide
  // below: it's short structured facts (Rang: Qora) a seller just knows,
  // unlike prose that benefits from a web search pass.
  characteristics: jsonb("characteristics")
    .$type<ProductCharacteristic[]>()
    .notNull()
    .default([]),
  // "Tarkib / Sostav" and "Foydalanish bo'yicha ko'rsatma" are NOT product
  // columns — they live in product_research.card (composition/usageGuide),
  // the same one-time AI+web-search pass that already produces the post
  // copy, so they're written once automatically and reused everywhere
  // (post text, storefront page) instead of being typed twice. See
  // artifacts/api-server/src/routes/store.ts for how the public storefront
  // joins product_research in to expose them.
  //
  // Delivery info stays a real column, though — it's genuinely
  // seller-specific info (not researchable from the web) collected via a
  // short modal right after a product is created, optionally AI-polished
  // from what the seller typed, and optionally reused as this seller's
  // default for every future product.
  deliveryInfo: text("delivery_info").notNull().default(""),
  status: text("status", { enum: PRODUCT_STATUSES }).notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

// Used for PATCH /api/products/:id — every field optional.
export const updateProductSchema = insertProductSchema.partial();

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type UpdateProduct = z.infer<typeof updateProductSchema>;
export type Product = typeof productsTable.$inferSelect;
