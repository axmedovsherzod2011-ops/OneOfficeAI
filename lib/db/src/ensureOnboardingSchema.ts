import { pool } from "./index";

// Same no-shell-access reasoning as the other ensure*Schema modules.
export async function ensureOnboardingSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamptz;
  `);
}
