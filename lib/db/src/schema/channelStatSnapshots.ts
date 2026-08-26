import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { telegramChannelsTable } from "./telegramChannels";

// Stores one subscriber/view snapshot per channel per HOUR (see hourBucket
// below). Written automatically — both by the hourly background scheduler
// (statsScheduler.ts) and, as a fallback for users the scheduler hasn't
// reached yet, whenever the live-stats endpoint is polled — so the chart
// accumulates real history over time without ever needing a backfill.
//
// Every value here is a POINT-IN-TIME CUMULATIVE reading (subscribers = the
// live gauge at that moment, views = the all-time total across every post
// at that moment) — never a delta. Turning these into "today's views" /
// "this week's growth" etc. is entirely the job of the aggregation layer
// (statsAggregation.ts), which subtracts the reading at a period's start
// from the reading at its end. Storing raw cumulative readings here and
// deriving every period figure at query time is what guarantees a stat
// from last month can never silently bleed into "today"'s number.
export const channelStatSnapshotsTable = pgTable("channel_stat_snapshots", {
  id: serial("id").primaryKey(),
  channelRowId: integer("channel_row_id")
    .notNull()
    .references(() => telegramChannelsTable.id, { onDelete: "cascade" }),
  // The calendar date this snapshot covers, stored as text "YYYY-MM-DD" —
  // kept (redundant with capturedAt) purely so existing day-level queries
  // written before hourBucket existed don't need to change.
  snapshotDate: text("snapshot_date").notNull(),
  // The exact moment this reading was captured. This is the real source of
  // truth for aggregation — snapshotDate/hourBucket are both just indexed,
  // string-typed projections of this for cheap equality filtering.
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  // "YYYY-MM-DD-HH" (local-to-UTC hour bucket) — the write-side upsert key.
  // Multiple polls within the same hour update one row instead of piling
  // up; a new hour (whether from the scheduler or a user poll) inserts a
  // fresh row. Nullable so adding this column to a table that already has
  // rows doesn't need a backfill default — aggregation never reads this
  // column anyway, it only ever reads capturedAt; a null here just means
  // "an old row from before this column existed", which naturally never
  // collides with the new upsert key and simply stays as its own point.
  hourBucket: text("hour_bucket"),
  subscribers: integer("subscribers").notNull().default(0),
  // Only ever populated by MTProto snapshots (stats.ts) — the Bot API has
  // no reliable way to read real view counts (see telegram/liveStats.ts),
  // so bot_api rows always leave this null rather than writing a fake 0.
  views: integer("views"),
  // "bot_api" | "mtproto" — lets one channel/hour have up to two rows (one
  // per source) while MTProto stats are being validated against the old
  // Bot API numbers before anything is cut over. Defaulted so existing
  // rows (all bot_api, written before this column existed) stay correct.
  source: text("source").notNull().default("bot_api"),
});

export type ChannelStatSnapshot =
  typeof channelStatSnapshotsTable.$inferSelect;
