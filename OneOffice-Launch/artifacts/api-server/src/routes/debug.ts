import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// TEMPORARY diagnostic route — remove once the production DB-mismatch
// issue is resolved. No auth on purpose (easiest to hit from a browser
// while debugging), but it never returns credentials — only host/db name
// and column presence, which is enough to compare against Neon's console.
router.get("/debug/db-info", async (_req, res) => {
  try {
    const raw = process.env.DATABASE_URL ?? "";
    let host = "(DATABASE_URL not set)";
    let database = "";
    try {
      const u = new URL(raw);
      host = u.hostname;
      database = u.pathname.replace(/^\//, "");
    } catch {
      host = "(could not parse DATABASE_URL)";
    }

    const columnsResult = await pool.query(
      `select column_name from information_schema.columns where table_name = 'users' order by column_name`,
    );
    const userCount = await pool.query(`select count(*)::int as count from users`);
    const currentDb = await pool.query(`select current_database() as db, inet_server_addr()::text as server_addr`);

    res.json({
      env_database_url_host: host,
      env_database_url_dbname: database,
      env_node_env: process.env.NODE_ENV ?? null,
      actual_connected_database: currentDb.rows[0]?.db ?? null,
      actual_server_addr: currentDb.rows[0]?.server_addr ?? null,
      users_table_columns: columnsResult.rows.map((r: any) => r.column_name),
      has_store_slug_column: columnsResult.rows.some(
        (r: any) => r.column_name === "store_slug",
      ),
      users_row_count: userCount.rows[0]?.count ?? null,
    });
  } catch (err: any) {
    res.status(500).json({
      error: "debug query failed",
      message: err?.message ?? String(err),
    });
  }
});

export default router;
