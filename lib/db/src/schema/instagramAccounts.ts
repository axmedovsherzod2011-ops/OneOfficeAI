import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A single connected Instagram (Business/Creator) account, linked via
// Meta's "Instagram API with Instagram Login" OAuth flow. A user connects
// these from Settings → Connectors, up to MAX_INSTAGRAM_ACCOUNTS_PER_USER
// at once — mirrors how Telegram channels work.
//
// Posting to Instagram isn't implemented yet; this table only stores the
// connection itself (profile + long-lived token) so a later step can add
// publishing without another schema change.
export const MAX_INSTAGRAM_ACCOUNTS_PER_USER = 3;

export const instagramAccountsTable = pgTable("instagram_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // Instagram-scoped user id for this account (stable per app+account).
  igUserId: text("ig_user_id").notNull(),
  username: text("username").notNull(),
  name: text("name").notNull().default(""),
  accountType: text("account_type").notNull().default(""),
  profilePictureUrl: text("profile_picture_url").notNull().default(""),
  // Long-lived token (60 days), refreshed on use once posting is built.
  accessToken: text("access_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type InstagramAccount = typeof instagramAccountsTable.$inferSelect;
