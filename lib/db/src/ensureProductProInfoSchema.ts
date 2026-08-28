import { pool } from "./index";

// Same "no shell access into the Render deployment" reasoning as
// ensureOrdersSchema.ts / ensureMtprotoSchema.ts / ensureStatsSchema.ts /
// ensureProductResearchSchema.ts — but this one ALTERs an EXISTING table
// (products) instead of creating a new one, since `drizzle-kit push`
// can't be run by hand against production here either. Each ADD COLUMN
// is guarded by IF NOT EXISTS, so this is a no-op after the first
// successful boot post-deploy, exactly like the CREATE TABLE IF NOT
// EXISTS pattern the other ensure*Schema functions use.
export async function ensureProductProInfoSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "characteristics" jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS "composition" text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "instructions" text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "delivery_info" text NOT NULL DEFAULT '';
  `);
}
