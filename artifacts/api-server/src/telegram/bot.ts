import crypto from "crypto";
import { db } from "@workspace/db";
import { telegramLinkTokensTable } from "@workspace/db/schema";
import { eq, lt, isNull, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Single GLOBAL Telegram bot shared by every OneOffice AI user. The token
// lives ONLY in this server's environment — it is never read from, or
// written to, the database, and never sent to the frontend.
// ---------------------------------------------------------------------------

export function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is not set. Add it in Secrets — this is the one global bot every user connects through.",
    );
  }
  return token;
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

let cachedBotUsername: string | null = process.env.TELEGRAM_BOT_USERNAME || null;
let cachedBotId: number | null = null;

// Resolves once (via env var if set, else a single getMe call) and caches
// for the life of the process — the bot's own identity never changes.
export async function getBotIdentity(): Promise<{
  id: number;
  username: string;
} | null> {
  if (!isTelegramConfigured()) return null;
  if (cachedBotUsername && cachedBotId) {
    return { id: cachedBotId, username: cachedBotUsername };
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${getBotToken()}/getMe`,
    );
    const data = (await res.json()) as {
      ok: boolean;
      result?: { id: number; username: string };
    };
    if (!data.ok || !data.result) return null;
    cachedBotId = data.result.id;
    cachedBotUsername = data.result.username;
    return { id: cachedBotId, username: cachedBotUsername };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Account-linking tokens: short-lived, single-use, stored in Postgres (see
// telegramLinkTokensTable). Maps a random token to the OneOffice user id
// who requested it, so when the bot receives "/start <token>" it knows
// which account to attach the sender's Telegram id to.
//
// This MUST be durable storage rather than in-process memory: the api
// server deploys on Replit's "autoscale" target, which can run multiple
// instances and cold-restart idle ones. A token created while handling the
// "link" request on one instance needs to be readable by a webhook request
// later handled by a completely different instance.
// ---------------------------------------------------------------------------

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;
// Old rows (used or expired) are cleaned up opportunistically so the table
// never grows unbounded — kept around briefly first so a double-tap or a
// retried Telegram delivery can still be told apart from "never existed".
const TOKEN_RETENTION_MS = 60 * 60 * 1000;

export async function createLinkToken(userId: number): Promise<string> {
  // Opportunistic cleanup of old rows. Best-effort — never blocks issuing
  // a fresh token if it fails for some reason.
  try {
    await db
      .delete(telegramLinkTokensTable)
      .where(lt(telegramLinkTokensTable.expiresAt, new Date(Date.now() - TOKEN_RETENTION_MS)));
  } catch (err) {
    console.error("[telegram] link token cleanup failed (non-fatal)", err);
  }

  const token = crypto.randomBytes(16).toString("hex");
  await db.insert(telegramLinkTokensTable).values({
    token,
    userId,
    expiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MS),
  });
  return token;
}

export type ConsumeLinkTokenResult =
  | { status: "ok"; userId: number }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "already_used" };

export async function consumeLinkToken(token: string): Promise<ConsumeLinkTokenResult> {
  const [row] = await db
    .select()
    .from(telegramLinkTokensTable)
    .where(eq(telegramLinkTokensTable.token, token))
    .limit(1);

  if (!row) return { status: "not_found" };
  if (row.usedAt !== null) return { status: "already_used" };

  const now = new Date();

  // Mark used atomically and only on the still-unused row, so two
  // near-simultaneous requests for the same token (a double-tap, or
  // Telegram redelivering an update) can't both read "ok" — whichever
  // UPDATE lands second will affect zero rows.
  const updated = await db
    .update(telegramLinkTokensTable)
    .set({ usedAt: now })
    .where(
      and(
        eq(telegramLinkTokensTable.id, row.id),
        isNull(telegramLinkTokensTable.usedAt),
      ),
    )
    .returning({ id: telegramLinkTokensTable.id });

  if (updated.length === 0) return { status: "already_used" };

  if (row.expiresAt < now) return { status: "expired" };

  return { status: "ok", userId: row.userId };
}

// ---------------------------------------------------------------------------
// Webhook registration — called once at server boot. Idempotent: Telegram
// simply overwrites the previous webhook URL/secret if called again, so
// this is safe to run on every restart.
// ---------------------------------------------------------------------------

export async function ensureTelegramWebhook(): Promise<void> {
  if (!isTelegramConfigured()) {
    console.log(
      "[telegram] TELEGRAM_BOT_TOKEN not set — skipping webhook setup. Telegram connect/publish will be unavailable until it's configured.",
    );
    return;
  }

  const publicUrl = process.env.PUBLIC_APP_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!publicUrl || !secret) {
    console.log(
      "[telegram] PUBLIC_APP_URL and/or TELEGRAM_WEBHOOK_SECRET not set — skipping webhook setup. Set both in Secrets to enable Telegram.",
    );
    return;
  }

  try {
    const webhookUrl = `${publicUrl.replace(/\/$/, "")}/api/telegram/webhook`;
    const res = await fetch(
      `https://api.telegram.org/bot${getBotToken()}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: secret,
          allowed_updates: ["message", "my_chat_member"],
        }),
      },
    );
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (data.ok) {
      console.log(`[telegram] webhook registered at ${webhookUrl}`);
    } else {
      console.error(`[telegram] setWebhook failed: ${data.description}`);
    }
  } catch (err) {
    console.error("[telegram] setWebhook request failed", err);
  }
}
