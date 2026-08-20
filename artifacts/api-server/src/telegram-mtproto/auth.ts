import { Api } from "teleproto";
import { computeCheck } from "teleproto/Password.js";
import { db } from "@workspace/db";
import {
  telegramMtprotoAccountsTable,
  telegramMtprotoPendingAuthTable,
} from "@workspace/db/schema";
import { eq, lt } from "drizzle-orm";
import { createMtprotoClient } from "./client";
import { encryptSessionString, decryptSessionString, maskPhoneNumber } from "./sessionCrypto";

// ---------------------------------------------------------------------------
// Raw MTProto login handshake (auth.sendCode -> auth.signIn -> optional
// auth.checkPassword for 2FA), deliberately NOT using teleproto's (GramJS-fork) client.start()
// convenience helper — that helper blocks on interactive callbacks inside a
// single process, which doesn't fit a stateless HTTP API that may be served
// by a different instance per request.
//
// Nothing here ever writes a raw phone number, verification code, or 2FA
// password to the database. Phone numbers are re-supplied by the caller on
// the verify-code request instead of being persisted (see routes file).
// ---------------------------------------------------------------------------

const PENDING_TTL_MS = 10 * 60 * 1000;

async function cleanupExpiredPending(): Promise<void> {
  try {
    await db
      .delete(telegramMtprotoPendingAuthTable)
      .where(lt(telegramMtprotoPendingAuthTable.expiresAt, new Date()));
  } catch (err) {
    console.error("[mtproto] pending-auth cleanup failed (non-fatal)", err);
  }
}

export type SendCodeResult =
  | { status: "code_sent"; pendingId: number }
  | { status: "error"; message: string };

export async function sendCode(
  userId: number,
  phoneNumber: string,
): Promise<SendCodeResult> {
  await cleanupExpiredPending();

  const client = await createMtprotoClient("");
  try {
    const sent = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber,
        apiId: Number(process.env.TELEGRAM_API_ID),
        apiHash: process.env.TELEGRAM_API_HASH!,
        settings: new Api.CodeSettings({}),
      }),
    );

    if (!(sent instanceof Api.auth.SentCode)) {
      return { status: "error", message: "Kod yuborilmadi. Qayta urinib ko'ring." };
    }

    // Session at this point is pre-auth (just DC/connection state) — still
    // encrypted at rest for consistency, even though it carries no login.
    const sessionEncrypted = encryptSessionString(client.session.save() as unknown as string);

    const [row] = await db
      .insert(telegramMtprotoPendingAuthTable)
      .values({
        userId,
        phoneCodeHash: sent.phoneCodeHash,
        sessionEncrypted,
        phoneNumberMasked: maskPhoneNumber(phoneNumber),
        awaitingPassword: false,
        expiresAt: new Date(Date.now() + PENDING_TTL_MS),
      })
      .returning({ id: telegramMtprotoPendingAuthTable.id });

    return { status: "code_sent", pendingId: row.id };
  } catch (err: any) {
    console.error("[mtproto] sendCode failed", err?.errorMessage ?? err);
    return {
      status: "error",
      message: "Telegramga ulanib bo'lmadi. Telefon raqamni tekshirib qayta urining.",
    };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

export type VerifyCodeResult =
  | { status: "authenticated" }
  | { status: "needs_password" }
  | { status: "error"; message: string };

export async function verifyCode(
  userId: number,
  pendingId: number,
  phoneNumber: string,
  code: string,
): Promise<VerifyCodeResult> {
  const [pending] = await db
    .select()
    .from(telegramMtprotoPendingAuthTable)
    .where(eq(telegramMtprotoPendingAuthTable.id, pendingId))
    .limit(1);

  if (!pending || pending.userId !== userId) {
    return { status: "error", message: "Sessiya topilmadi. Qaytadan boshlang." };
  }
  if (pending.expiresAt < new Date()) {
    await db
      .delete(telegramMtprotoPendingAuthTable)
      .where(eq(telegramMtprotoPendingAuthTable.id, pendingId));
    return { status: "error", message: "Kod muddati tugagan. Qaytadan boshlang." };
  }

  const sessionString = decryptSessionString(pending.sessionEncrypted);
  const client = await createMtprotoClient(sessionString);
  try {
    try {
      const result = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber,
          phoneCodeHash: pending.phoneCodeHash,
          phoneCode: code,
        }),
      );
      return await finalizeAuth(userId, pendingId, client, result);
    } catch (err: any) {
      if (err?.errorMessage === "SESSION_PASSWORD_NEEDED") {
        // 2FA is on — persist the now-partially-signed-in session so the
        // password step can resume it, and mark this pending row as such.
        const sessionEncrypted = encryptSessionString(
          client.session.save() as unknown as string,
        );
        await db
          .update(telegramMtprotoPendingAuthTable)
          .set({ sessionEncrypted, awaitingPassword: true })
          .where(eq(telegramMtprotoPendingAuthTable.id, pendingId));
        return { status: "needs_password" };
      }
      throw err;
    }
  } catch (err: any) {
    console.error("[mtproto] verifyCode failed", err?.errorMessage ?? err);
    return { status: "error", message: "Kod noto'g'ri yoki muddati tugagan." };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

export type VerifyPasswordResult =
  | { status: "authenticated" }
  | { status: "error"; message: string };

export async function verifyPassword(
  userId: number,
  pendingId: number,
  password: string,
): Promise<VerifyPasswordResult> {
  const [pending] = await db
    .select()
    .from(telegramMtprotoPendingAuthTable)
    .where(eq(telegramMtprotoPendingAuthTable.id, pendingId))
    .limit(1);

  if (!pending || pending.userId !== userId || !pending.awaitingPassword) {
    return { status: "error", message: "Sessiya topilmadi. Qaytadan boshlang." };
  }
  if (pending.expiresAt < new Date()) {
    await db
      .delete(telegramMtprotoPendingAuthTable)
      .where(eq(telegramMtprotoPendingAuthTable.id, pendingId));
    return { status: "error", message: "Muddati tugagan. Qaytadan boshlang." };
  }

  const sessionString = decryptSessionString(pending.sessionEncrypted);
  const client = await createMtprotoClient(sessionString);
  try {
    const passwordInfo = await client.invoke(new Api.account.GetPassword());
    const srpCheck = await computeCheck(passwordInfo, password);
    const result = await client.invoke(new Api.auth.CheckPassword({ password: srpCheck }));
    const outcome = await finalizeAuth(userId, pendingId, client, result);
    return outcome.status === "authenticated"
      ? { status: "authenticated" }
      : { status: "error", message: "Autentifikatsiya yakunlanmadi." };
  } catch (err: any) {
    console.error("[mtproto] verifyPassword failed", err?.errorMessage ?? err);
    return { status: "error", message: "Parol noto'g'ri." };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

async function finalizeAuth(
  userId: number,
  pendingId: number,
  client: Awaited<ReturnType<typeof createMtprotoClient>>,
  authResult: unknown,
): Promise<VerifyCodeResult> {
  if (!(authResult instanceof Api.auth.Authorization)) {
    return { status: "error", message: "Autentifikatsiya yakunlanmadi." };
  }

  const mtprotoUserId = String((authResult.user as any)?.id ?? "");
  const sessionEncrypted = encryptSessionString(client.session.save() as unknown as string);

  await db
    .insert(telegramMtprotoAccountsTable)
    .values({
      userId,
      mtprotoUserId,
      sessionEncrypted,
      status: "active",
      connectedAt: new Date(),
      lastUsedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: telegramMtprotoAccountsTable.userId,
      set: {
        mtprotoUserId,
        sessionEncrypted,
        status: "active",
        connectedAt: new Date(),
        lastUsedAt: new Date(),
        revokedAt: null,
      },
    });

  await db
    .delete(telegramMtprotoPendingAuthTable)
    .where(eq(telegramMtprotoPendingAuthTable.id, pendingId));

  return { status: "authenticated" };
}

export async function revoke(userId: number): Promise<void> {
  const [account] = await db
    .select()
    .from(telegramMtprotoAccountsTable)
    .where(eq(telegramMtprotoAccountsTable.userId, userId))
    .limit(1);

  if (!account || !account.sessionEncrypted) return;

  // Best-effort: tell Telegram to log out this session too, not just
  // forget it locally.
  try {
    const sessionString = decryptSessionString(account.sessionEncrypted);
    const client = await createMtprotoClient(sessionString);
    await client.invoke(new Api.auth.LogOut()).catch(() => {});
    await client.disconnect().catch(() => {});
  } catch (err) {
    console.error("[mtproto] revoke: remote logout failed (continuing)", err);
  }

  await db
    .update(telegramMtprotoAccountsTable)
    .set({
      status: "revoked",
      sessionEncrypted: null,
      revokedAt: new Date(),
    })
    .where(eq(telegramMtprotoAccountsTable.userId, userId));
}

export async function getStatus(
  userId: number,
): Promise<{ connected: boolean; status?: string; connectedAt?: Date | null }> {
  const [account] = await db
    .select()
    .from(telegramMtprotoAccountsTable)
    .where(eq(telegramMtprotoAccountsTable.userId, userId))
    .limit(1);

  if (!account) return { connected: false };
  return {
    connected: account.status === "active",
    status: account.status,
    connectedAt: account.connectedAt,
  };
}
