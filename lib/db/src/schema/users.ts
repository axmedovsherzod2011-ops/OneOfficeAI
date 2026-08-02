import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  // Links this business profile row to the person's Firebase identity
  // (email/password, Google, or Apple sign-in). Auth/session is entirely
  // owned by Firebase Authentication now — this column is how we find
  // "our" profile data for whoever is currently signed in.
  firebaseUid: text("firebase_uid").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  company: text("company").notNull(),
  // Public slug for this user's storefront page (/store/:slug — no login
  // required to view it). Generated lazily the first time the person
  // opens Connectors → Vitrina, not at sign-up, so existing users get one
  // on demand instead of needing a backfill migration.
  storeSlug: text("store_slug").unique(),
  // The person's own Telegram account id (not the bot's), set once they
  // link Telegram from Connectors by messaging the global OneOffice bot.
  // This is how the bot's webhook knows which OneOffice account to attach
  // a newly-admin'd channel to — no token or chat id ever entered by hand.
  telegramUserId: text("telegram_user_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
