// Debug script — NOT part of the app, safe to delete after use.
//
// Run from lib/db/:
//   node debug/check-db.mjs
//
// What it does, in order, printing clearly at each step:
//   1. Confirms DATABASE_URL is set and connects.
//   2. Confirms the "users" table has a "telegram_user_id" column and the
//      "telegram_channels" table exists (the exact things /start and the
//      admin-promotion webhook touch).
//   3. Picks one real row from "users" and performs the *exact same*
//      UPDATE that the /start handler runs — wrapped in a transaction that
//      is always rolled back at the end, so it never actually changes your
//      data — and prints the full raw error if it fails.
//
// This tells you the real underlying error instead of the generic
// "kutilmagan server xatoligi" message the bot sends to users.

import pg from "pg";

const { Pool } = pg;

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

async function main() {
  console.log("=== 1) Environment ===");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    fail(
      "DATABASE_URL is not set in this shell. Make sure you're running this " +
        "in the same environment (Secrets) as the deployment you're debugging — " +
        "if your deployment uses different Secrets than this workspace, this " +
        "test won't reflect production.",
    );
  }
  ok(`DATABASE_URL is set (host: ${new URL(dbUrl).hostname})`);

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: true },
  });

  console.log("\n=== 2) Connectivity ===");
  try {
    const res = await pool.query("select current_database(), current_user");
    ok(`Connected — database="${res.rows[0].current_database}" user="${res.rows[0].current_user}"`);
  } catch (err) {
    console.error(err);
    fail("Could not connect to the database at all (see raw error above).");
  }

  console.log("\n=== 3) Schema check ===");
  try {
    const cols = await pool.query(
      `select column_name, data_type, is_nullable
       from information_schema.columns
       where table_name = 'users'
       order by ordinal_position`,
    );
    if (cols.rows.length === 0) {
      fail('Table "users" does not exist in this database at all.');
    }
    console.log('Columns on "users":');
    for (const row of cols.rows) {
      console.log(`   - ${row.column_name} (${row.data_type}, nullable=${row.is_nullable})`);
    }
    const hasTelegramCol = cols.rows.some((r) => r.column_name === "telegram_user_id");
    if (!hasTelegramCol) {
      fail(
        'Table "users" has NO "telegram_user_id" column. This is the bug: ' +
          "run `pnpm --filter db push` against THIS database (the one DATABASE_URL " +
          "above points to) to create it.",
      );
    }
    ok('"users.telegram_user_id" column exists.');

    const channelsTable = await pool.query(
      `select to_regclass('public.telegram_channels') as exists`,
    );
    if (!channelsTable.rows[0].exists) {
      fail(
        'Table "telegram_channels" does not exist in this database. ' +
          "Run `pnpm --filter db push` against this database.",
      );
    }
    ok('"telegram_channels" table exists.');
  } catch (err) {
    console.error(err);
    fail("Schema check query itself failed (see raw error above).");
  }

  console.log("\n=== 4) Reproducing the exact /start UPDATE ===");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      "select id, telegram_user_id from users order by id limit 1",
    );
    if (rows.length === 0) {
      console.log("⚠️  No rows in \"users\" to test against — skipping this step.");
    } else {
      const testUserId = rows[0].id;
      console.log(`Using existing user id=${testUserId} for a throwaway test (will be rolled back)...`);

      try {
        await client.query(
          `update users set telegram_user_id = $1 where id = $2`,
          [`debug-test-${Date.now()}`, testUserId],
        );
        ok("UPDATE succeeded — the query itself is fine against this database.");
      } catch (err) {
        console.error("\n--- RAW ERROR FROM THE UPDATE (this is what you need) ---");
        console.error({
          message: err.message,
          code: err.code,
          detail: err.detail,
          table: err.table,
          column: err.column,
          constraint: err.constraint,
          schema: err.schema,
          routine: err.routine,
        });
        console.error("--- end raw error ---\n");
      }
    }

    await client.query("ROLLBACK");
    ok("Rolled back — no data was actually changed.");
  } finally {
    client.release();
  }

  await pool.end();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\n--- UNEXPECTED SCRIPT ERROR ---");
  console.error(err);
  process.exit(1);
});
