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
const linkTokens = new Map<string, { userId: number; expiresAt: number }>();

export function createLinkToken(userId: number): string {
  // Opportunistically sweep expired tokens so this map never grows
  // unbounded on a long-running process.
  const now = Date.now();
  for (const [t, v] of linkTokens) {
    if (v.expiresAt < now) linkTokens.delete(t);
  }

  const token = crypto.randomBytes(16).toString("hex");
  linkTokens.set(token, { userId, expiresAt: now + LINK_TOKEN_TTL_MS });
  return token;
}

export function consumeLinkToken(token: string): number | null {
  const entry = linkTokens.get(token);
  if (!entry) return null;
  linkTokens.delete(token);
  if (entry.expiresAt < Date.now()) return null;
  return entry.userId;
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
