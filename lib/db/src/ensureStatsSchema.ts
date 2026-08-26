import { pool } from "./index";

// ---------------------------------------------------------------------------
// Same reasoning as ensureMtprotoSchema.ts / ensureProductResearchSchema.ts:
// no shell access into the Render deployment to run `drizzle-kit push` by
// hand, so these ALTER TABLEs run at server boot instead, guarded by IF NOT
// EXISTS — a no-op after the first successful boot.
//
// captured_at: exact-moment timestamp every aggregation query relies on.
// DEFAULT now() backfills existing rows sensibly (their real capture time
// is lost, but they were daily-granularity anyway so this doesn't regress
// anything real).
// hour_bucket: nullable write-side dedupe key — old rows simply keep it
// null, which never collides with the new upsert key, so no backfill is
// needed for correctness.
// ---------------------------------------------------------------------------

export async function ensureStatsSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE "channel_stat_snapshots"
      ADD COLUMN IF NOT EXISTS "captured_at" timestamptz NOT NULL DEFAULT now();
  `);
  await pool.query(`
    ALTER TABLE "channel_stat_snapshots"
      ADD COLUMN IF NOT EXISTS "hour_bucket" text;
  `);
}
