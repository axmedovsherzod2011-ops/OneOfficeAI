import crypto from "crypto";

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
// Account-linking tokens: short-lived, single-use, in-memory (this is a
// ~10-minute handshake, not durable data — no schema/migration needed for
// it, and it self-cleans on expiry). Maps a random token to the OneOffice
// user id who requested it, so when the bot receives "/start <token>" it
// knows which account to attach the sender's Telegram id to.
// ---------------------------------------------------------------------------

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;
// A "used" token is kept around (not deleted) for a short grace window so a
// double-tap on the deep link, or Telegram re-delivering the same update,
// can be told apart from a token that never existed / was mistyped.
const USED_TOKEN_RETENTION_MS = 10 * 60 * 1000;

type LinkTokenEntry = {
  userId: number;
  expiresAt: number;
  usedAt: number | null;
};

const linkTokens = new Map<string, LinkTokenEntry>();

export function createLinkToken(userId: number): string {
  // Opportunistically sweep long-dead entries so this map never grows
  // unbounded on a long-running process.
  const now = Date.now();
  for (const [t, v] of linkTokens) {
    const deadSince = v.usedAt ?? v.expiresAt;
    if (now - deadSince > USED_TOKEN_RETENTION_MS) linkTokens.delete(t);
  }

  const token = crypto.randomBytes(16).toString("hex");
  linkTokens.set(token, { userId, expiresAt: now + LINK_TOKEN_TTL_MS, usedAt: null });
  return token;
}

export type ConsumeLinkTokenResult =
  | { status: "ok"; userId: number }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "already_used" };

export function consumeLinkToken(token: string): ConsumeLinkTokenResult {
  const entry = linkTokens.get(token);
  if (!entry) return { status: "not_found" };

  if (entry.usedAt !== null) return { status: "already_used" };

  if (entry.expiresAt < Date.now()) {
    entry.usedAt = Date.now();
    return { status: "expired" };
  }

  entry.usedAt = Date.now();
  return { status: "ok", userId: entry.userId };
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
