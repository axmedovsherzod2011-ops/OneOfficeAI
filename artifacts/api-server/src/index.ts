import dotenv from "dotenv";
import path from "node:path";

// Root .env faylini yuklash.
// index.ts CWD: artifacts/api-server
// Shuning uchun ../../.env -> OneOfficeAI/.env
dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

import app from "./app";
import { logger } from "./lib/logger";
import { ensureTelegramWebhook } from "./telegram/bot";
import { ensureMtprotoSchema, ensureProductResearchSchema, ensureStatsSchema, ensureOrdersSchema, ensureProductProInfoSchema } from "@workspace/db";
import { startStatsScheduler } from "./scheduler/statsScheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Creates the telegram_mtproto_* tables/columns if they don't exist yet.
// See lib/db/src/ensureMtprotoSchema.ts for why this runs here instead of
// `drizzle-kit push` (no shell access into this deployment to run it by
// hand). Awaited before listen() so the very first request never races a
// half-created schema; it's a fast no-op on every boot after the first.
await ensureMtprotoSchema().catch((err) => {
  logger.error({ err }, "ensureMtprotoSchema failed — mtproto routes will 500 until this is fixed");
});

// Creates the product_research table if it doesn't exist yet. Same
// boot-time-DDL reasoning as ensureMtprotoSchema above.
await ensureProductResearchSchema().catch((err) => {
  logger.error(
    { err },
    "ensureProductResearchSchema failed — product research caching will 500 until this is fixed",
  );
});

// Adds channel_stat_snapshots.captured_at / .hour_bucket if they don't
// exist yet. Same boot-time-DDL reasoning as the two above.
await ensureStatsSchema().catch((err) => {
  logger.error(
    { err },
    "ensureStatsSchema failed — hour/day/week/month/year dashboard stats will be inaccurate until this is fixed",
  );
});

// Creates the orders table if it doesn't exist yet. Same no-shell-access
// reasoning as the ensure*Schema calls above.
await ensureOrdersSchema().catch((err) => {
  logger.error({ err }, "ensureOrdersSchema failed — storefront checkout and the Orders page will 500 until this is fixed");
});

// Adds products.characteristics / .composition / .instructions /
// .delivery_info if they don't exist yet. Same no-shell-access reasoning
// as the ensure*Schema calls above — this one ALTERs the existing
// products table rather than creating a new one.
await ensureProductProInfoSchema().catch((err) => {
  logger.error(
    { err },
    "ensureProductProInfoSchema failed — product characteristics/composition/instructions/delivery info will 500 until this is fixed",
  );
});

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Registers (or re-registers) this server's URL with Telegram so
  // my_chat_member / message updates actually reach /api/telegram/webhook.
  // Without this call, promoting the bot to admin in a channel is
  // invisible to the server — Telegram has nowhere to send that event.
  void ensureTelegramWebhook();

  // Captures an hourly subscribers/views snapshot for every user in the
  // background, independent of anyone having the dashboard open — this is
  // what makes a real "last 24 hours" chart possible instead of only ever
  // having whatever irregular gaps a user's own visits happened to leave.
  startStatsScheduler();
});