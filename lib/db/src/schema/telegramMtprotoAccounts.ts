import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ---------------------------------------------------------------------------
// A user's personal MTProto (real Telegram account) login — completely
// separate from the bot identity. `users.telegramUserId` is set when
// someone links their account to the single GLOBAL OneOffice bot; the
// `mtprotoUserId` here is set only once they've gone through a real
// Telegram login (phone → code → optional 2FA) via GramJS. Never conflate
// the two: one row here does NOT imply a linked bot, and vice versa.
//
// `sessionEncrypted` holds a GramJS StringSession, encrypted at rest with
// TELEGRAM_MTPROTO_SESSION_ENC_KEY (see telegram-mtproto/sessionCrypto.ts).
// It is NULL until authentication actually completes — the in-progress
// phone/code/password exchange is never persisted here or anywhere else in
// the database; it only lives in short-lived in-process state
// (telegram-mtproto/auth.ts) for the few seconds it takes the user to type
// the code Telegram sent them.
// ---------------------------------------------------------------------------

export const telegramMtprotoAccountsTable = pgTable(
  "telegram_mtproto_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .unique()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // Telegram's own user id for the authenticated account, filled in once
    // auth succeeds. Intentionally not unique/FK'd to anything — it's
    // informational only.
    mtprotoUserId: text("mtproto_user_id"),
    // Masked for display only, e.g. "+998 90 *** ** 12" — never the full
    // number.
    phoneNumberMasked: text("phone_number_masked"),
    // AES-256-GCM ciphertext (iv:authTag:data, base64) of the GramJS
    // StringSession. NULL until status = "active".
    sessionEncrypted: text("session_encrypted"),
    // pending_auth: row created, auth not finished yet (rare to see this
    //   persisted at all — see auth.ts; kept for crash-recovery visibility)
    // active: sessionEncrypted is a valid, usable session
    // revoked: user logged out / disconnected — sessionEncrypted cleared
    // expired: Telegram rejected the session on last use (e.g. AUTH_KEY_UNREGISTERED)
    status: text("status").notNull().default("pending_auth"),
    connectedAt: timestamp("connected_at"),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export type TelegramMtprotoAccount =
  typeof telegramMtprotoAccountsTable.$inferSelect;
