import { db } from "@workspace/db";
import { telegramChannelsTable, telegramMtprotoAccountsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getSubscriberCount } from "../telegram/liveStats";
import { recordHourlySnapshot } from "../stats/statsAggregation";
import { getMtprotoLiveStatsForUser } from "../telegram-mtproto/stats";
import { logger } from "../lib/logger";

const HOUR_MS = 60 * 60 * 1000;

// bot_api side: every active channel gets its own hourly subscriber
// snapshot, independent of which user owns it or whether they're online.
async function captureBotApiChannels(): Promise<void> {
  const channels = await db
    .select()
    .from(telegramChannelsTable)
    .where(eq(telegramChannelsTable.isActive, true));

  for (const c of channels) {
    try {
      const subscribers = await getSubscriberCount(c.channelId, c.botToken);
      if (subscribers != null) {
        await recordHourlySnapshot(c.id, "bot_api", { subscribers });
      }
    } catch (err) {
      logger.warn({ err, channelId: c.id }, "[stats scheduler] bot_api capture failed for channel");
    }
  }
}

// mtproto side: getMtprotoLiveStatsForUser already writes hourly snapshots
// (subscribers + real views) for every channel of the given user as a side
// effect — reuse it as-is rather than duplicating that fetch+write logic.
async function captureMtprotoAccounts(): Promise<void> {
  const accounts = await db
    .select({ userId: telegramMtprotoAccountsTable.userId })
    .from(telegramMtprotoAccountsTable)
    .where(eq(telegramMtprotoAccountsTable.status, "active"));

  for (const a of accounts) {
    try {
      await getMtprotoLiveStatsForUser(a.userId);
    } catch (err) {
      logger.warn({ err, userId: a.userId }, "[stats scheduler] mtproto capture failed for user");
    }
  }
}

async function runCaptureCycle(): Promise<void> {
  await captureBotApiChannels().catch((err) =>
    logger.error({ err }, "[stats scheduler] bot_api cycle failed"),
  );
  await captureMtprotoAccounts().catch((err) =>
    logger.error({ err }, "[stats scheduler] mtproto cycle failed"),
  );
}

// Starts a background loop that captures one subscribers/views snapshot per
// connected channel every hour, for every user — regardless of whether
// anyone has the dashboard open at that moment. Without this, "last 24
// hours" (or "last 5 years") charts would only ever have whatever
// irregular gaps a user's own visits happened to leave, which is exactly
// the bug this whole feature exists to fix.
export function startStatsScheduler(): void {
  // Small delay after boot so this doesn't compete with the very first
  // requests for DB connections / Telegram API calls.
  setTimeout(() => void runCaptureCycle(), 30_000);
  setInterval(() => void runCaptureCycle(), HOUR_MS);
}
