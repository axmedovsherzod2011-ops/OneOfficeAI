import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { db } from "@workspace/db";
import { telegramMtprotoAccountsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { encryptSessionString, maskPhoneNumber } from "./sessionCrypto";

// ---------------------------------------------------------------------------
// Adapts GramJS's `client.start()` — built for a single blocking CLI
// script that prompts phoneNumber/phoneCode/password in order — to a
// stateless HTTP API: POST /start, POST /code, POST /password, each a
// separate request. We do this by never awaiting client.start() in the
// request handler that kicks it off; instead we hand it callbacks that
// return promises we resolve later from a *different* request, once the
// user has actually typed the code/password. The client.start() call
// keeps running in the background on the server the whole time.
//
// Nothing about the in-progress phone number, code, or password is ever
// written to the database — only the in-memory PendingAuth entry below,
// which is deleted the moment auth finishes or fails, and opportunistically
// after AUTH_TTL_MS regardless.
// ---------------------------------------------------------------------------

function getApiCredentials(): { apiId: number; apiHash: string } {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!apiId || Number.isNaN(apiId) || !apiHash) {
    throw new Error(
      "TELEGRAM_API_ID / TELEGRAM_API_HASH is not set. Get these from " +
        "my.telegram.org and add them in Secrets.",
    );
  }
  return { apiId, apiHash };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type PendingStage = "awaiting_code" | "awaiting_password" | "finishing";

type PendingAuth = {
  client: TelegramClient;
  phone: string;
  stage: PendingStage;
  codeDeferred: ReturnType<typeof deferred<string>>;
  passwordDeferred: ReturnType<typeof deferred<string>> | null;
  startedAt: number;
  // Set once client.start() itself settles (success or failure), so a
  // request handler that's waiting on stage transitions can also notice
  // terminal failure instead of hanging until timeout.
  result: Promise<void>;
  error: unknown;
};

const AUTH_TTL_MS = 10 * 60 * 1000; // matches the existing bot link-token TTL
const pendingByUserId = new Map<number, PendingAuth>();

function cleanupStale(): void {
  const now = Date.now();
  for (const [userId, entry] of pendingByUserId) {
    if (now - entry.startedAt > AUTH_TTL_MS) {
      entry.client.disconnect().catch(() => {});
      pendingByUserId.delete(userId);
    }
  }
}
setInterval(cleanupStale, 60 * 1000).unref();

export type StartAuthResult =
  | { status: "code_sent" }
  | { status: "error"; message: string };

// Called by POST /auth/start. Resolves once Telegram has actually sent the
// login code to the user's device (or immediately on failure) — does NOT
// wait for the whole login to complete.
export async function startMtprotoAuth(
  userId: number,
  phoneNumber: string,
): Promise<StartAuthResult> {
  // Only one in-flight attempt per user — a fresh /start cancels any
  // previous unfinished one rather than leaking connections.
  const existing = pendingByUserId.get(userId);
  if (existing) {
    existing.client.disconnect().catch(() => {});
    pendingByUserId.delete(userId);
  }

  const { apiId, apiHash } = getApiCredentials();
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 3,
  });

  const codeSent = deferred<void>();
  const codeDeferred = deferred<string>();
  let passwordDeferred: ReturnType<typeof deferred<string>> | null = null;
  const passwordNeeded = deferred<void>();

  const entry: PendingAuth = {
    client,
    phone: phoneNumber,
    stage: "awaiting_code",
    codeDeferred,
    passwordDeferred: null,
    startedAt: Date.now(),
    result: Promise.resolve(),
    error: null,
  };
  pendingByUserId.set(userId, entry);

  const startPromise = client
    .start({
      phoneNumber: async () => phoneNumber,
      phoneCode: async () => {
        codeSent.resolve();
        return codeDeferred.promise;
      },
      password: async () => {
        passwordDeferred = deferred<string>();
        entry.passwordDeferred = passwordDeferred;
        entry.stage = "awaiting_password";
        passwordNeeded.resolve();
        return passwordDeferred.promise;
      },
      onError: (err) => {
        // GramJS calls this for auth-flow errors (e.g. wrong code) — we
        // surface it to whichever request is currently waiting rather
        // than letting client.start() hang.
        if (entry.stage === "awaiting_code") {
          codeDeferred.reject(err);
        } else if (entry.stage === "awaiting_password" && passwordDeferred) {
          passwordDeferred.reject(err);
        }
      },
    })
    .then(async () => {
      entry.stage = "finishing";
      await finalizeAuth(userId, client);
    })
    .catch((err) => {
      entry.error = err;
    })
    .finally(() => {
      pendingByUserId.delete(userId);
    });

  entry.result = startPromise;

  const outcome = await Promise.race([
    codeSent.promise.then(() => "code_sent" as const),
    startPromise.then(() => "ended" as const),
  ]);

  if (outcome === "ended") {
    // client.start() finished (or failed) before ever asking for a code —
    // something went wrong up front (bad phone number format, network,
    // etc). entry.error holds the reason.
    const message = describeAuthError(entry.error);
    return { status: "error", message };
  }

  return { status: "code_sent" };
}

export type SubmitCodeResult =
  | { status: "password_needed" }
  | { status: "authenticated"; mtprotoUserId: string }
  | { status: "error"; message: string };

// Called by POST /auth/code.
export async function submitMtprotoCode(
  userId: number,
  code: string,
): Promise<SubmitCodeResult> {
  const entry = pendingByUserId.get(userId);
  if (!entry || entry.stage !== "awaiting_code") {
    return {
      status: "error",
      message: "Kod kutilmayapti. Avval telefon raqamni yuboring.",
    };
  }

  entry.codeDeferred.resolve(code);

  return waitForNextStageOrCompletion(userId, entry);
}

export type SubmitPasswordResult =
  | { status: "authenticated"; mtprotoUserId: string }
  | { status: "error"; message: string };

// Called by POST /auth/password (2FA).
export async function submitMtprotoPassword(
  userId: number,
  password: string,
): Promise<SubmitPasswordResult> {
  const entry = pendingByUserId.get(userId);
  if (!entry || entry.stage !== "awaiting_password" || !entry.passwordDeferred) {
    return {
      status: "error",
      message: "Parol kutilmayapti.",
    };
  }

  entry.passwordDeferred.resolve(password);

  const outcome = await waitForNextStageOrCompletion(userId, entry);
  if (outcome.status === "password_needed") {
    // Shouldn't happen (password is only asked once), but keep the type
    // checker honest and fail loudly rather than silently mis-reporting.
    return { status: "error", message: "Kutilmagan holat." };
  }
  return outcome;
}

// Shared "wait until either the next callback fires or the whole flow
// settles" logic used by both submitMtprotoCode and submitMtprotoPassword.
async function waitForNextStageOrCompletion(
  userId: number,
  entry: PendingAuth,
): Promise<SubmitCodeResult> {
  const passwordRequested = deferred<void>();
  const originalStage = entry.stage;

  // Poll briefly for a stage change, since the password callback (if any)
  // fires asynchronously inside client.start()'s continuation. A short
  // interval is fine here — this only runs for the few hundred ms it
  // takes GramJS to process the code server-side.
  const poll = setInterval(() => {
    if (entry.stage !== originalStage) passwordRequested.resolve();
  }, 50);

  const outcome = await Promise.race([
    passwordRequested.promise.then(() => "password_needed" as const),
    entry.result.then(() => "ended" as const),
  ]);
  clearInterval(poll);

  if (outcome === "password_needed") {
    return { status: "password_needed" };
  }

  // Flow ended — either finalizeAuth already ran (success) or it errored.
  if (entry.error) {
    return { status: "error", message: describeAuthError(entry.error) };
  }

  const [account] = await db
    .select({ mtprotoUserId: telegramMtprotoAccountsTable.mtprotoUserId })
    .from(telegramMtprotoAccountsTable)
    .where(eq(telegramMtprotoAccountsTable.userId, userId))
    .limit(1);

  if (!account?.mtprotoUserId) {
    return {
      status: "error",
      message: "Autentifikatsiya tugadi, lekin akkaunt topilmadi.",
    };
  }

  return { status: "authenticated", mtprotoUserId: account.mtprotoUserId };
}

// Runs once GramJS reports success: reads the session, encrypts it, and
// upserts the account row. The live client is disconnected right after —
// later stages (channel discovery, stats) reconnect on demand from the
// stored encrypted session rather than keeping this connection open
// indefinitely per user.
async function finalizeAuth(userId: number, client: TelegramClient): Promise<void> {
  try {
    const me = await client.getMe();
    const mtprotoUserId = String((me as any).id);
    const sessionString = (client.session as StringSession).save() as unknown as string;
    const encrypted = encryptSessionString(sessionString);

    const entry = pendingByUserId.get(userId);
    const maskedPhone = entry ? maskPhoneNumber(entry.phone) : null;

    await db
      .insert(telegramMtprotoAccountsTable)
      .values({
        userId,
        mtprotoUserId,
        phoneNumberMasked: maskedPhone,
        sessionEncrypted: encrypted,
        status: "active",
        connectedAt: new Date(),
        lastUsedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: telegramMtprotoAccountsTable.userId,
        set: {
          mtprotoUserId,
          phoneNumberMasked: maskedPhone,
          sessionEncrypted: encrypted,
          status: "active",
          connectedAt: new Date(),
          lastUsedAt: new Date(),
          revokedAt: null,
        },
      });
  } finally {
    await client.disconnect().catch(() => {});
  }
}

function describeAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("PHONE_CODE_INVALID")) {
    return "Kiritilgan kod noto'g'ri.";
  }
  if (message.includes("PHONE_CODE_EXPIRED")) {
    return "Kod muddati tugagan. Qaytadan urinib ko'ring.";
  }
  if (message.includes("PASSWORD_HASH_INVALID")) {
    return "Parol noto'g'ri.";
  }
  if (message.includes("PHONE_NUMBER_INVALID")) {
    return "Telefon raqami noto'g'ri formatda.";
  }
  return "Telegram bilan bog'lanishda xatolik yuz berdi.";
}

// Called by the logout/revoke route (see routes/telegramMtproto.ts).
export async function revokeMtprotoAccount(userId: number): Promise<void> {
  await db
    .update(telegramMtprotoAccountsTable)
    .set({ status: "revoked", sessionEncrypted: null, revokedAt: new Date() })
    .where(eq(telegramMtprotoAccountsTable.userId, userId));

  const pending = pendingByUserId.get(userId);
  if (pending) {
    pending.client.disconnect().catch(() => {});
    pendingByUserId.delete(userId);
  }
}
