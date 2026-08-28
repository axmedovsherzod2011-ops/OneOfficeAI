import { pool } from "./index";

// Same "no shell access into the Render deployment" reasoning as
// ensureOrdersSchema.ts / ensureMtprotoSchema.ts / ensureStatsSchema.ts /
// ensureProductResearchSchema.ts — but this one ALTERs EXISTING tables
// (products, users) instead of creating new ones, since `drizzle-kit push`
// can't be run by hand against production here either. Each ADD COLUMN is
// guarded by IF NOT EXISTS, so this is a no-op after the first successful
// boot post-deploy.
//
// Note: an earlier version of this migration also added products.composition
// and products.instructions. Those turned out to be the wrong model — that
// prose is researched once by the same AI+web-search pass that already
// builds the post copy (see product_research.card.composition / .usageGuide
// in ai/productCard.ts), not typed by hand — so the two columns are no
// longer written or read anywhere. They're harmless leftover columns in
// production (never dropped, to avoid a risky DDL against live data for
// zero functional benefit) — just dead weight, not a bug.
export async function ensureProductProInfoSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "characteristics" jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS "delivery_info" text NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "default_delivery_info" text;
  `);
}
