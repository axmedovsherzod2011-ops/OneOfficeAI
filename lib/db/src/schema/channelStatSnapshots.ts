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
});

export type ChannelStatSnapshot =
  typeof channelStatSnapshotsTable.$inferSelect;
