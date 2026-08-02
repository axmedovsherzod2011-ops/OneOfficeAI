#!/usr/bin/env bash
# Migrates data from the old Replit-provisioned Postgres to a Neon
# Postgres database. Run this from the Replit Shell (it needs network
# access to both databases).
#
# Usage:
#   bash scripts/migrate-to-neon.sh "<OLD_DATABASE_URL>" "<NEON_DATABASE_URL>"
#
# What it does, in order:
#   1. pg_dump the old database to /tmp/oneoffice_dump.sql
#   2. Push the current Drizzle schema to Neon (creates tables)
#   3. Restore the dumped data into Neon
#   4. Print row counts from both databases so you can compare them
#
# It does NOT touch your DATABASE_URL secret — you still need to update
# that yourself in Tools -> Secrets once you've confirmed the row counts
# match. That keeps the app pointed at the old DB until you're sure the
# copy succeeded.

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: bash scripts/migrate-to-neon.sh \"<OLD_DATABASE_URL>\" \"<NEON_DATABASE_URL>\"" >&2
  exit 1
fi

OLD_DATABASE_URL="$1"
NEON_DATABASE_URL="$2"
DUMP_FILE="/tmp/oneoffice_dump.sql"

for bin in pg_dump psql pnpm; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Error: '$bin' not found on PATH." >&2
    exit 1
  fi
done

TABLES=(users posts telegram_channels)

echo "==> 1/4  Dumping old database..."
pg_dump "$OLD_DATABASE_URL" --no-owner --no-privileges --format=plain -f "$DUMP_FILE"
echo "    Dump written to $DUMP_FILE"

echo "==> 2/4  Pushing current schema to Neon..."
DATABASE_URL="$NEON_DATABASE_URL" pnpm --filter @workspace/db run push

echo "==> 3/4  Restoring data into Neon..."
psql "$NEON_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$DUMP_FILE"

echo "==> 4/4  Row counts (old vs. Neon) — verify these match:"
printf "%-20s %10s %10s\n" "table" "old" "neon"
for t in "${TABLES[@]}"; do
  old_count=$(psql "$OLD_DATABASE_URL" -t -A -c "SELECT count(*) FROM ${t};" 2>/dev/null || echo "n/a")
  neon_count=$(psql "$NEON_DATABASE_URL" -t -A -c "SELECT count(*) FROM ${t};" 2>/dev/null || echo "n/a")
  printf "%-20s %10s %10s\n" "$t" "$old_count" "$neon_count"
done

echo
echo "If the counts above match: update the DATABASE_URL secret in"
echo "Tools -> Secrets to the Neon connection string, restart the app,"
echo "and test it. Only then deprovision the old Replit database."
