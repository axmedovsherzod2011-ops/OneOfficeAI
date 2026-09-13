import { pool } from "./index";

// Same no-shell-access-to-Render reasoning as every other ensure*Schema
// module here.
export async function ensureOneHelpTasksSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "one_help_tasks" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "description" text NOT NULL,
      "action_type" text NOT NULL,
      "kind" text NOT NULL,
      "time_of_day" text,
      "status" text NOT NULL DEFAULT 'active',
      "next_run_at" timestamp NOT NULL,
      "last_run_at" timestamp,
      "last_error" text,
      "created_at" timestamp NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "one_help_tasks_due_idx"
      ON "one_help_tasks" ("status", "next_run_at");
  `);
}
