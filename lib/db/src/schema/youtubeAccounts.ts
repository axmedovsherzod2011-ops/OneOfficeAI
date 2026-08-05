import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A connected YouTube channel, linked via Google OAuth 2.0
// (Authorization Code flow, server-side exchange so GOOGLE_CLIENT_SECRET
// never touches the browser). A user can connect up to
// MAX_YOUTUBE_ACCOUNTS_PER_USER channels. Each row stores both the
// access token and the refresh token so the backend can silently renew
// expired access tokens before any upload attempt.
export const MAX_YOUTUBE_ACCOUNTS_PER_USER = 3;

export const youtubeAccountsTable = pgTable("youtube_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // YouTube channel ID (e.g. "UCxxxxxx").  Stable across token refreshes.
  channelId: text("channel_id").notNull(),
  title: text("title").notNull().default(""),
  customUrl: text("custom_url").notNull().default(""),
  thumbnailUrl: text("thumbnail_url").notNull().default(""),
  // Short-lived (1h). Refreshed automatically before any API call.
  accessToken: text("access_token").notNull(),
  // Null when the user granted only online access or later revoked offline.
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type YoutubeAccount = typeof youtubeAccountsTable.$inferSelect;
