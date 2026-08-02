import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A Telegram channel connected through the single GLOBAL OneOffice bot.
// There is no per-user bot token and no chat id typed in by hand anymore —
// a row here is created automatically by the Telegram webhook the moment
// the channel owner promotes the bot to administrator (see
// artifacts/api-server/src/routes/telegram.ts). A user may connect any
// number of channels.
export const telegramChannelsTable = pgTable("telegram_channels", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // Telegram's numeric chat id for the channel (channels use large negative
  // ids, e.g. -1001234567890) — stored as text since it can exceed a
  // regular JS/Postgres integer's safe range.
  channelId: text("channel_id").notNull(),
  // Only public channels have a @username; private channels don't, so this
  // is nullable — channelTitle is what's shown in the UI either way.
  channelUsername: text("channel_username"),
  channelTitle: text("channel_title").notNull().default(""),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
  // Flipped to false (not deleted) if the bot is ever demoted or removed
  // from the channel, so history/posts referencing this row still resolve.
  isActive: boolean("is_active").notNull().default(true),
});

export type TelegramChannel = typeof telegramChannelsTable.$inferSelect;
