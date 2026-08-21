import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ---------------------------------------------------------------------------
// A user's own MTProto (real Telegram account) authorization — completely
// separate from the global Bot API integration.
//
// IMPORTANT: users.telegramUserId is the id the person's account has in the
// *bot-linking* flow (see telegram/bot.ts — "/start <token>"). mtprotoUserId
// below is set independently once MTProto auth succeeds and must never be
// read from or written to users.telegramUserId. A bot-linked identity and
// an MTProto-authorized session are different trust boundaries even when
// they happen to belong to the same physical Telegram account.
//
// sessionEncrypted holds a GramJS StringSession, encrypted at rest with
// TELEGRAM_MTPROTO_SESSION_ENC_KEY (see telegram-mtproto/sessionCrypto.ts).
// It is never sent to the frontend and never logged.
// ---------------------------------------------------------------------------

export const telegramMtprotoAccountsTable = pgTable("telegram_mtproto_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // Telegram's own numeric user id for the authorized account. Null until
  // authentication completes.
  mtprotoUserId: text("mtproto_user_id"),
  // Display-only, e.g. "+998 90 *** ** 12" — never the full number.
  phoneNumberMasked: text("phone_number_masked"),
  // Encrypted GramJS StringSession. Null until auth completes.
  sessionEncrypted: text("session_encrypted"),
  // pending_auth | active | revoked | expired
  status: text("status").notNull().default("pending_auth"),
  connectedAt: timestamp("connected_at"),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TelegramMtprotoAccount = typeof telegramMtprotoAccountsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Short-lived state for an in-progress phone -> code -> 2FA login.
//
// This MUST be durable (Postgres), not in-process memory, for the same
// reason telegramLinkTokensTable is: the api server runs on an autoscale
// target that can run multiple instances, so the request that submits the
// code may land on a different instance than the one that sent it.
//
// Deliberately does NOT store the raw phone number, verification code, or
// 2FA password anywhere, ever — only what's needed to resume the GramJS
// auth handshake (the pre-auth session string, encrypted, and Telegram's
// own phoneCodeHash, which is meaningless without it).
// ---------------------------------------------------------------------------

export const telegramMtprotoPendingAuthTable = pgTable("telegram_mtproto_pending_auth", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  phoneCodeHash: text("phone_code_hash").notNull(),
  // Pre-auth GramJS session (connection/DC state only, not yet authorized),
  // encrypted with the same key as the final session.
  sessionEncrypted: text("session_encrypted").notNull(),
  phoneNumberMasked: text("phone_number_masked").notNull(),
  // True once SendCode succeeded and Telegram is waiting on SignIn; flipped
  // when SignIn instead comes back SESSION_PASSWORD_NEEDED, so the
  // verify-password route knows this pending row is now waiting on the 2FA
  // password rather than the SMS/app code.
  awaitingPassword: boolean("awaiting_password").notNull().default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TelegramMtprotoPendingAuth =
  typeof telegramMtprotoPendingAuthTable.$inferSelect;
