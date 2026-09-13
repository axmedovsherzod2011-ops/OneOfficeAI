import type { NextFunction, Request, Response } from "express";

// Temporary safety guard while the MTProto login flow is being diagnosed.
// Telegram itself rate-limits auth.sendCode/auth.resendCode; this prevents a
// user double-clicking or repeatedly retrying from turning a delivery issue
// into PHONE_NUMBER_FLOOD.
const SEND_COOLDOWN_MS = 90_000;
const RESEND_COOLDOWN_MS = 60_000;

const lastRequestAt = new Map<string, number>();

function getKey(req: Request): string {
  // Prefer the authenticated Firebase token as the user key. Fall back to IP
  // so unauthenticated/misconfigured requests cannot bypass the guard.
  const auth = req.header("authorization") ?? "";
  return auth ? `auth:${auth}` : `ip:${req.ip}`;
}

function messageFor(path: string, waitSeconds: number): string {
  if (path.endsWith("/resend-code")) {
    return `Kod qayta yuborish vaqtincha cheklangan. ${waitSeconds} soniyadan keyin qayta urinib ko'ring.`;
  }
  return `Telegram kodi uchun yangi so'rov vaqtincha cheklangan. ${waitSeconds} soniyadan keyin qayta urinib ko'ring.`;
}

export function telegramCodeRateLimit(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "POST") return next();

  const path = req.path;
  const isSend = path.endsWith("/telegram-mtproto/send-code");
  const isResend = path.endsWith("/telegram-mtproto/resend-code");
  if (!isSend && !isResend) return next();

  const key = `${isSend ? "send" : "resend"}:${getKey(req)}`;
  const cooldown = isSend ? SEND_COOLDOWN_MS : RESEND_COOLDOWN_MS;
  const now = Date.now();
  const previous = lastRequestAt.get(key) ?? 0;
  const remaining = cooldown - (now - previous);

  if (remaining > 0) {
    const waitSeconds = Math.ceil(remaining / 1000);
    res.setHeader("Retry-After", String(waitSeconds));
    res.status(429).json({
      error: messageFor(path, waitSeconds),
      code: "TELEGRAM_CODE_RATE_LIMIT",
      retryAfterSeconds: waitSeconds,
      temporary: true,
    });
    return;
  }

  lastRequestAt.set(key, now);
  next();
}
