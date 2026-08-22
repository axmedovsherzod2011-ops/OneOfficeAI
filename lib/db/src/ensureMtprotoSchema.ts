import { pool } from "./index";

// ---------------------------------------------------------------------------
// This project manages its schema with `drizzle-kit push` (schema-sync, no
// migration files) — normally run by hand against DATABASE_URL. There's no
// shell access into the Render deployment to run that command there, so this
// runs the equivalent DDL at server boot instead, using the DB connection
// the server already has. Every statement is IF NOT EXISTS / ADD COLUMN IF
// NOT EXISTS, so it's a no-op (a handful of fast catalog lookups) on every
// boot after the first — safe to leave in permanently.
//
// Scope: only the tables/columns telegram-mtproto/* introduced. Nothing
// else the app already relies on is touched here.
// ---------------------------------------------------------------------------

export async function ensureMtprotoSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "telegram_mtproto_accounts" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
      "mtproto_user_id" text,
      "phone_number_masked" text,
      "session_encrypted" text,
      "status" text NOT NULL DEFAULT 'pending_auth',
      "connected_at" timestamp,
      "last_used_at" timestamp,
      "revoked_at" timestamp,
      "created_at" timestamp NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "telegram_mtproto_pending_auth" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "phone_code_hash" text NOT NULL,
      "session_encrypted" text NOT NULL,
      "phone_number_masked" text NOT NULL,
      "awaiting_password" boolean NOT NULL DEFAULT false,
      "expires_at" timestamp NOT NULL,
      "created_at" timestamp NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    ALTER TABLE "channel_stat_snapshots"
      ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'bot_api';
  `);

  await pool.query(`
    ALTER TABLE "channel_stat_snapshots"
      ADD COLUMN IF NOT EXISTS "views" integer;
  `);
}
