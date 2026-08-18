import crypto from "crypto";

// ---------------------------------------------------------------------------
// Encrypts/decrypts GramJS StringSession values before they touch Postgres.
// A GramJS session string is equivalent to a live, unattended login to the
// user's real Telegram account — anyone who reads it in plaintext can
// impersonate them indefinitely. It must never be stored, logged, or
// returned to the frontend unencrypted.
//
// AES-256-GCM: TELEGRAM_MTPROTO_SESSION_ENC_KEY (32 raw bytes, base64) is
// the key; a fresh random IV per encryption; the GCM auth tag is stored
// alongside so tampering is detected on decrypt, not silently accepted.
// ---------------------------------------------------------------------------

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.TELEGRAM_MTPROTO_SESSION_ENC_KEY;
  if (!raw) {
    throw new Error(
      "TELEGRAM_MTPROTO_SESSION_ENC_KEY is not set. Generate one with " +
        "`openssl rand -base64 32` and add it in Secrets — MTProto " +
        "sessions cannot be stored without it.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "TELEGRAM_MTPROTO_SESSION_ENC_KEY must decode to exactly 32 bytes " +
        `(got ${key.length}). Generate with \`openssl rand -base64 32\`.`,
    );
  }
  cachedKey = key;
  return key;
}

// Returns "iv:authTag:ciphertext", each base64 — a single text column value.
export function encryptSessionString(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSessionString(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted session value.");
  }
  const [ivB64, authTagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64!, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64!, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64!, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// For display only — never log or return the real number.
export function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  const last2 = digits.slice(-2);
  const country = phone.trim().startsWith("+") ? phone.trim().slice(0, 4) : "";
  return `${country} *** ** ${last2}`;
}
