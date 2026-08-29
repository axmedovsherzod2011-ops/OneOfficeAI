import { Api } from "teleproto";
import { computeCheck } from "teleproto/Password.js";
import { db } from "@workspace/db";
import {
  telegramMtprotoAccountsTable,
  telegramMtprotoPendingAuthTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, lt } from "drizzle-orm";
import { createMtprotoClient } from "./client";
import { encryptSessionString, decryptSessionString, maskPhoneNumber } from "./sessionCrypto";
import { createLinkToken, getBotIdentity } from "../telegram/bot";

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

// Which channel Telegram actually used to deliver the code — surfaced to
// the UI so the person knows where to look (its own "Telegram" system chat
// vs SMS vs a phone call) instead of guessing.
export type CodeDeliveryMethod = "app" | "sms" | "call" | "flash_call" | "other";

function deliveryMethodFromSentCode(sent: Api.auth.SentCode): CodeDeliveryMethod {
  const type = sent.type;
  if (type instanceof Api.auth.SentCodeTypeApp) return "app";
  if (
    type instanceof Api.auth.SentCodeTypeSms ||
    type instanceof Api.auth.SentCodeTypeFragmentSms ||
    type instanceof Api.auth.SentCodeTypeFirebaseSms ||
    type instanceof Api.auth.SentCodeTypeSmsWord
  )
    return "sms";
  if (type instanceof Api.auth.SentCodeTypeCall) return "call";
  if (
    type instanceof Api.auth.SentCodeTypeFlashCall ||
    type instanceof Api.auth.SentCodeTypeMissedCall
  )
    return "flash_call";
  return "other";
}

export type SendCodeResult =
  | { status: "code_sent"; pendingId: number; deliveryMethod: CodeDeliveryMethod }
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

    const deliveryMethod = deliveryMethodFromSentCode(sent);
    console.log(`[mtproto] code sent via "${sent.type?.className}" (${deliveryMethod})`);

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

    return { status: "code_sent", pendingId: row.id, deliveryMethod };
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

export type ResendCodeResult =
  | { status: "code_sent"; deliveryMethod: CodeDeliveryMethod }
  | { status: "error"; message: string };

// Asks Telegram itself for a different delivery method — its own
// auth.resendCode. Telegram decides the fallback (usually SMS or a call
// after the in-app message), we don't control which; this is the only
// legitimate way to change how the code arrives.
export async function resendCode(
  userId: number,
  pendingId: number,
  phoneNumber: string,
): Promise<ResendCodeResult> {
  const [pending] = await db
    .select()
    .from(telegramMtprotoPendingAuthTable)
    .where(eq(telegramMtprotoPendingAuthTable.id, pendingId))
    .limit(1);

  if (!pending || pending.userId !== userId) {
    return { status: "error", message: "Sessiya topilmadi. Qaytadan boshlang." };
  }
  if (pending.expiresAt < new Date()) {
    return { status: "error", message: "Muddati tugagan. Qaytadan boshlang." };
  }

  const sessionString = decryptSessionString(pending.sessionEncrypted);
  const client = await createMtprotoClient(sessionString);
  try {
    const sent = await client.invoke(
      new Api.auth.ResendCode({
        phoneNumber,
        phoneCodeHash: pending.phoneCodeHash,
      }),
    );
    if (!(sent instanceof Api.auth.SentCode)) {
      return { status: "error", message: "Kod qayta yuborilmadi." };
    }

    const deliveryMethod = deliveryMethodFromSentCode(sent);
    console.log(`[mtproto] code resent via "${sent.type?.className}" (${deliveryMethod})`);

    // phoneCodeHash can change on resend — and the client's session state
    // moved on too, so persist both.
    const sessionEncrypted = encryptSessionString(client.session.save() as unknown as string);
    await db
      .update(telegramMtprotoPendingAuthTable)
      .set({ phoneCodeHash: sent.phoneCodeHash, sessionEncrypted })
      .where(eq(telegramMtprotoPendingAuthTable.id, pendingId));

    return { status: "code_sent", deliveryMethod };
  } catch (err: any) {
    console.error("[mtproto] resendCode failed", err?.errorMessage ?? err);
    return { status: "error", message: "Kod qayta yuborilmadi. Birozdan so'ng urinib ko'ring." };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

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

// ---------------------------------------------------------------------------
// The MTProto login flow above proves someone controls a phone number/
// Telegram account — but on its own that's a DIFFERENT thing from the
// Bot-API account link (users.telegramUserId) that lets OneOffice AI
// message this person through @OneOfficeAIBot (order notifications, etc.)
// and that the bot's own /start flow (telegramWebhook.ts) sets up.
//
// Manually asking someone to also go find the bot and type /start after
// they've just finished a whole phone+code (+maybe 2FA) flow is exactly
// the kind of extra step that makes someone confused enough to bounce, or
// to block a bot they don't recognize sending them a random first
// message. Since we already have this person's own authenticated MTProto
// session right here, we can just send that /start ourselves, AS them —
// Telegram then delivers it to the bot exactly like they'd typed it, and
// the existing webhook handler links the account and replies, with zero
// extra steps for the person.
// ---------------------------------------------------------------------------

async function autoStartBotIfNeeded(
  userId: number,
  client: Awaited<ReturnType<typeof createMtprotoClient>>,
): Promise<void> {
  try {
    const [user] = await db
      .select({ telegramUserId: usersTable.telegramUserId })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    // Already linked (this MTProto account, a previous session, or even a
    // manual /start from before) — nothing to do, and definitely don't
    // re-send /start on every login and spam them.
    if (user?.telegramUserId) {
      console.log(`[mtproto] auto /start skipped for user ${userId} — already linked (telegramUserId=${user.telegramUserId})`);
      return;
    }

    const identity = await getBotIdentity();
    if (!identity) {
      console.log(`[mtproto] auto /start skipped for user ${userId} — bot not configured (no TELEGRAM_BOT_TOKEN)`);
      return;
    }

    const token = await createLinkToken(userId);
    console.log(`[mtproto] auto /start: resolving @${identity.username} for user ${userId}...`);

    // A brand-new MTProto session has never "seen" @OneOfficeAIBot before
    // — it isn't in this session's local entity cache the way an existing
    // dialog/contact would be. Passing the bare username straight to
    // sendMessage relies on it resolving that itself, which is exactly
    // where this was silently failing (caught below, logged, never
    // surfaced) instead of actually sending anything. Resolving the
    // entity explicitly first — the same contacts.resolveUsername lookup
    // opening the chat in the Telegram app would trigger — fixes that:
    // once resolved, sendMessage has an actual entity to address, not
    // just a string it has to guess how to look up.
    const botEntity = await client.getEntity(identity.username);
    console.log(`[mtproto] auto /start: entity resolved, sending for user ${userId}...`);
    const sent = await client.sendMessage(botEntity, { message: `/start ${token}` });
    console.log(`[mtproto] auto /start: sent for user ${userId}, message id=${(sent as any)?.id ?? "?"}`);
  } catch (err: any) {
    // Best-effort — the person can still link manually from Connectors,
    // and this must never fail the MTProto login itself. Logged with the
    // same errorMessage-first shape as every other catch in this file, so
    // a real cause (rather than just "[object Object]") shows up in logs
    // if this needs debugging again.
    console.error(`[mtproto] auto /start failed for user ${userId} (non-fatal)`, err?.errorMessage ?? err);
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

  // Fire this while `client` is still connected (the caller disconnects
  // it in their own `finally`, after finalizeAuth returns) — reusing the
  // same authenticated connection instead of opening a second one.
  await autoStartBotIfNeeded(userId, client);

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

  // Covers people who connected MTProto before this auto-/start existed,
  // or whose very first attempt failed silently (network blip, bot
  // briefly unconfigured) — checked here too, not just at the moment of
  // login, since "ulagan bo'lsa" (already connected) was explicitly asked
  // for, not just "ulashi bilanoq" (right as they connect). Fully
  // fire-and-forget: never awaited, so a slow/failed attempt can't delay
  // this status check, which the Connectors page likely polls/loads often.
  //
  // The telegramUserId check happens here too (cheap, DB-only) BEFORE
  // even considering opening an MTProto connection — getStatus can be
  // called often, and the overwhelmingly common case is "already linked,
  // nothing to do", which should never cost a client connect/disconnect
  // round-trip.
  if (account.status === "active" && account.sessionEncrypted) {
    void (async () => {
      try {
        const [user] = await db
          .select({ telegramUserId: usersTable.telegramUserId })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        if (user?.telegramUserId) return;

        const sessionString = decryptSessionString(account.sessionEncrypted!);
        const client = await createMtprotoClient(sessionString);
        try {
          await autoStartBotIfNeeded(userId, client);
        } finally {
          await client.disconnect().catch(() => {});
        }
      } catch (err) {
        console.error("[mtproto] getStatus auto /start failed (non-fatal)", err);
      }
    })();
  }

  return {
    connected: account.status === "active",
    status: account.status,
    connectedAt: account.connectedAt,
  };
}
