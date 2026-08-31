import { pool } from "./index";

// Same no-shell-access-to-Render reasoning as every other ensure*Schema
// module in this file.
export async function ensureOneHelpSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "one_help_messages" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "role" text NOT NULL,
      "content" text NOT NULL,
      "created_at" timestamp NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "one_help_messages_user_id_created_at_idx"
      ON "one_help_messages" ("user_id", "created_at");
  `);
}
