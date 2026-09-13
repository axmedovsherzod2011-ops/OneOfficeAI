import { pool } from "./index";

// Same no-shell-access reasoning as the other ensure*Schema modules.
// Adds users.language (mandatory pre-signup language choice, changeable
// from Profile) and users.category (AI-classified once from the sign-up
// "nima sotasiz?" hint) if they don't exist yet.
export async function ensureProfileSettingsSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "language" text NOT NULL DEFAULT 'uz',
      ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT '';
  `);
}
