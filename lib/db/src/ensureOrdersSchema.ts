import { pool } from "./index";

// Same no-shell-access reasoning as ensureMtprotoSchema.ts /
// ensureProductResearchSchema.ts / ensureStatsSchema.ts: this table is
// brand new, so CREATE TABLE IF NOT EXISTS runs at server boot instead of
// requiring a manual `drizzle-kit push` against production.
export async function ensureOrdersSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "orders" (
      "id" serial PRIMARY KEY,
      "order_number" text NOT NULL UNIQUE,
      "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "store_slug" text NOT NULL,
      "items" jsonb NOT NULL DEFAULT '[]',
      "total_amount" text NOT NULL DEFAULT '0',
      "currency" text NOT NULL DEFAULT 'UZS',
      "customer_name" text NOT NULL DEFAULT '',
      "customer_phone" text NOT NULL DEFAULT '',
      "customer_address" text NOT NULL DEFAULT '',
      "customer_comment" text,
      "status" text NOT NULL DEFAULT 'new',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "orders_user_id_idx" ON "orders" ("user_id");
  `);
}
