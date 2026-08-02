import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Short-lived, single-use tokens for "/start <token>" account linking.
//
// IMPORTANT: this used to be an in-memory Map on the api-server process.
// That broke under Replit's autoscale deployment target, which can run
// multiple instances (and cold-restart idle ones), each with its own
// separate memory — a token created while handling the "link" request on
// one instance was invisible to a webhook request later handled by a
// different instance, surfacing as a false "token not found" error. Storing
// it in Postgres instead makes it visible to every instance.
export const telegramLinkTokensTable = pgTable("telegram_link_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TelegramLinkToken = typeof telegramLinkTokensTable.$inferSelect;
