import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { db } from "@workspace/db";
import { telegramMtprotoAccountsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { decryptSessionString } from "./sessionCrypto";

// ---------------------------------------------------------------------------
// Reconnects a GramJS client from the user's stored, encrypted session —
// used by channel discovery and stats (stages 5/6), never by the login
// flow itself (see auth.ts, which creates its own fresh client per login
// attempt). Callers MUST call disconnectMtprotoClient() when done; this
// module does not pool or keep connections open between requests.
// ---------------------------------------------------------------------------

export type GetClientResult =
  | { status: "ok"; client: TelegramClient }
  | { status: "not_connected" }
  | { status: "expired" };

export async function getAuthorizedMtprotoClient(
  userId: number,
): Promise<GetClientResult> {
  const [account] = await db
    .select()
    .from(telegramMtprotoAccountsTable)
    .where(eq(telegramMtprotoAccountsTable.userId, userId))
    .limit(1);

  if (!account || account.status !== "active" || !account.sessionEncrypted) {
    return { status: "not_connected" };
  }

  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!apiId || !apiHash) {
    throw new Error("TELEGRAM_API_ID / TELEGRAM_API_HASH is not set.");
  }

  const sessionString = decryptSessionString(account.sessionEncrypted);
  const client = new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { connectionRetries: 3 },
  );

  try {
    await client.connect();
  } catch (err) {
    await client.disconnect().catch(() => {});
    throw err;
  }

  const authorized = await client.checkAuthorization();
  if (!authorized) {
    await client.disconnect().catch(() => {});
    // Telegram no longer honors this session (revoked from another
    // device, expired, etc). Mark it so the dashboard shows "reconnect"
    // instead of silently failing on every stats poll.
    await db
      .update(telegramMtprotoAccountsTable)
      .set({ status: "expired" })
      .where(eq(telegramMtprotoAccountsTable.userId, userId));
    return { status: "expired" };
  }

  await db
    .update(telegramMtprotoAccountsTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(telegramMtprotoAccountsTable.userId, userId));

  return { status: "ok", client };
}

export async function disconnectMtprotoClient(
  client: TelegramClient,
): Promise<void> {
  await client.disconnect().catch(() => {});
}
