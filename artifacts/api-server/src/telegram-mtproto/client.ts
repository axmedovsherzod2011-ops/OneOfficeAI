import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";

// ---------------------------------------------------------------------------
// apiId/apiHash identify *this application* to Telegram — one pair, shared
// by every user, exactly like TELEGRAM_BOT_TOKEN in telegram/bot.ts. They
// are NOT a substitute for a user's own session; a session is what actually
// authorizes as that person's account.
// ---------------------------------------------------------------------------

export function isMtprotoConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH);
}

function getApiId(): number {
  const raw = process.env.TELEGRAM_API_ID;
  if (!raw) {
    throw new Error("TELEGRAM_API_ID is not set. Get one at https://my.telegram.org.");
  }
  const id = Number(raw);
  if (!Number.isInteger(id)) {
    throw new Error("TELEGRAM_API_ID must be a numeric string.");
  }
  return id;
}

function getApiHash(): string {
  const hash = process.env.TELEGRAM_API_HASH;
  if (!hash) {
    throw new Error("TELEGRAM_API_HASH is not set. Get one at https://my.telegram.org.");
  }
  return hash;
}

// Creates a connected client from a (possibly empty) session string.
// Caller is responsible for calling client.disconnect() when done — these
// are short-lived, per-request clients, not a long-running pool, since the
// api server can run multiple autoscale instances and there's no shared
// in-memory place to keep persistent connections anyway.
export async function createMtprotoClient(
  sessionString: string,
): Promise<TelegramClient> {
  const client = new TelegramClient(
    new StringSession(sessionString),
    getApiId(),
    getApiHash(),
    { connectionRetries: 3 },
  );
  await client.connect();
  return client;
}

export async function withMtprotoClient<T>(
  sessionString: string,
  fn: (client: TelegramClient) => Promise<T>,
): Promise<T> {
  const client = await createMtprotoClient(sessionString);
  try {
    return await fn(client);
  } finally {
    await client.disconnect().catch(() => {});
  }
}
