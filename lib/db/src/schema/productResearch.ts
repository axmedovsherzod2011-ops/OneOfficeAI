import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { productsTable } from "./products";

// ---------------------------------------------------------------------------
// One-time "deep research" result for a product. The whole point of this
// table: web search + the AI call that builds the professional product card
// are expensive (time + tokens) and the output barely changes between two
// posts for the *same* product. So we do it ONCE per product, cache the
// result here, and every later "Create Post" for that same product reads
// this row instead of hitting the AI/search pipeline again.
//
// `productId` is UNIQUE — one row per product. A manual "re-research" (the
// user asks for a refresh) overwrites the row via onConflictDoUpdate rather
// than inserting a second one.
// ---------------------------------------------------------------------------

export const PRODUCT_RESEARCH_STATUSES = ["ready", "failed"] as const;

export const productResearchTable = pgTable("product_research", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .unique()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // The full "Professional Product Card": search/view/buy copy plus the
  // existing market-price + specs fields. Shape is ProductCard (see
  // artifacts/api-server/src/ai/productCard.ts) — kept as loose jsonb here
  // so the card can grow new fields without a schema migration.
  card: jsonb("card").$type<Record<string, unknown>>().notNull(),
  // Which pages the research drew on, for transparency in the UI ("manba:
  // uzum.uz" badges) and so a refresh can compare against what it saw last
  // time.
  sources: jsonb("sources").$type<{ title: string; url: string }[]>().notNull().default([]),
  status: text("status", { enum: PRODUCT_RESEARCH_STATUSES }).notNull().default("ready"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProductResearchSchema = createInsertSchema(productResearchTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProductResearch = z.infer<typeof insertProductResearchSchema>;
export type ProductResearch = typeof productResearchTable.$inferSelect;
