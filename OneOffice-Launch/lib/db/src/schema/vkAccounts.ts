import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A single connected VK (VKontakte) account, linked via VK's OAuth flow.
// A user connects these from Settings → Connectors, up to
// MAX_VK_ACCOUNTS_PER_USER at once — mirrors how Instagram accounts work.
//
// Posting to a VK wall isn't implemented yet; this table only stores the
// connection itself (profile + access token) so a later step can add
// publishing without another schema change.
export const MAX_VK_ACCOUNTS_PER_USER = 3;

export const vkAccountsTable = pgTable("vk_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // VK-scoped user id for this account (stable per app+account).
  vkUserId: text("vk_user_id").notNull(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  screenName: text("screen_name").notNull().default(""),
  photoUrl: text("photo_url").notNull().default(""),
  accessToken: text("access_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type VkAccount = typeof vkAccountsTable.$inferSelect;
