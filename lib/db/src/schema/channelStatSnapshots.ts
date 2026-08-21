import { pgTable, serial, integer, text, date } from "drizzle-orm/pg-core";
import { telegramChannelsTable } from "./telegramChannels";

// Stores one subscriber-count row per channel per calendar day.
// Written automatically when the live-stats endpoint is polled
// so the chart accumulates real history over time.
export const channelStatSnapshotsTable = pgTable("channel_stat_snapshots", {
  id: serial("id").primaryKey(),
  channelRowId: integer("channel_row_id")
    .notNull()
    .references(() => telegramChannelsTable.id, { onDelete: "cascade" }),
  // The calendar date this snapshot covers, stored as text "YYYY-MM-DD"
  // so we never hit timezone-mangling from JS Date <-> Postgres date round-trips.
  snapshotDate: text("snapshot_date").notNull(),
  subscribers: integer("subscribers").notNull().default(0),
  // Only ever populated by MTProto snapshots (stats.ts) — the Bot API has
  // no reliable way to read real view counts (see telegram/liveStats.ts),
  // so bot_api rows always leave this null rather than writing a fake 0.
  views: integer("views"),
  // "bot_api" | "mtproto" — lets one channel/day have up to two rows (one
  // per source) while MTProto stats are being validated against the old
  // Bot API numbers before anything is cut over. Defaulted so existing
  // rows (all bot_api, written before this column existed) stay correct.
  source: text("source").notNull().default("bot_api"),
});

export type ChannelStatSnapshot =
  typeof channelStatSnapshotsTable.$inferSelect;
