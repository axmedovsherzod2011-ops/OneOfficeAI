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

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  // Kept as text (not numeric) to match the existing posts.price pattern —
  // preserves whatever formatting the user typed, no currency parsing.
  costPrice: text("cost_price").notNull().default(""),
  sellPrice: text("sell_price").notNull().default(""),
  description: text("description").notNull().default(""),
  // Uploaded image URLs, in display order. Empty until at least one image
  // is attached.
  images: jsonb("images").$type<string[]>().notNull().default([]),
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
