import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { telegramChannelsTable } from "./telegramChannels";
import { productsTable } from "./products";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  // Which connected Telegram channel this went out to. Nullable for old
  // rows created before multi-channel connectors existed.
  telegramChannelId: integer("telegram_channel_id").references(
    () => telegramChannelsTable.id,
  ),
  // Which inventory product this post was generated from. Nullable —
  // older posts predate the Inventory feature.
  productId: integer("product_id").references(() => productsTable.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  price: text("price").notNull(),
  category: text("category").notNull().default("Electronics"),
  status: text("status").notNull().default("Published"),
  telegramMessageId: integer("telegram_message_id"),
  platform: text("platform").default("telegram").notNull(),
  platformPostId: text("platform_post_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, createdAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;
