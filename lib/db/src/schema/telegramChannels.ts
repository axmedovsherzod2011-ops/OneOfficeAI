import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// A single connected Telegram channel + the bot that posts to it. A user
// connects these from Settings → Connectors (not during sign-up anymore),
// and may have up to MAX_TELEGRAM_CHANNELS_PER_USER of them at once.
export const MAX_TELEGRAM_CHANNELS_PER_USER = 3;

export const telegramChannelsTable = pgTable("telegram_channels", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  channelUsername: text("channel_username").notNull(),
  channelId: text("channel_id").notNull(),
  botToken: text("bot_token").notNull(),
  botUsername: text("bot_username").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTelegramChannelSchema = createInsertSchema(
  telegramChannelsTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertTelegramChannel = z.infer<
  typeof insertTelegramChannelSchema
>;
export type TelegramChannel = typeof telegramChannelsTable.$inferSelect;
