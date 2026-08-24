import { pool } from "./index";

// ---------------------------------------------------------------------------
// Same reasoning as ensureMtprotoSchema.ts: no shell access into the Render
// deployment to run `drizzle-kit push` by hand, so the CREATE TABLE runs at
// server boot instead, guarded by IF NOT EXISTS — a no-op after the first
// successful boot.
// ---------------------------------------------------------------------------

export async function ensureProductResearchSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "product_research" (
      "id" serial PRIMARY KEY,
      "product_id" integer NOT NULL UNIQUE REFERENCES "products"("id") ON DELETE CASCADE,
      "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "card" jsonb NOT NULL,
      "sources" jsonb NOT NULL DEFAULT '[]',
      "status" text NOT NULL DEFAULT 'ready',
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    );
  `);
}
