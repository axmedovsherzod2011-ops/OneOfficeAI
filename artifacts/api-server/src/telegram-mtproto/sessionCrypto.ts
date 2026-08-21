import crypto from "crypto";

// ---------------------------------------------------------------------------
// AES-256-GCM encryption for teleproto/GramJS session strings before they ever touch
// Postgres. TELEGRAM_MTPROTO_SESSION_ENC_KEY must be a 32-byte key, given
// as base64 (openssl rand -base64 32). Never logged, never sent to the
// frontend — this module is the only place that reads it.
// ---------------------------------------------------------------------------

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.TELEGRAM_MTPROTO_SESSION_ENC_KEY;
  if (!raw) {
    throw new Error(
      "TELEGRAM_MTPROTO_SESSION_ENC_KEY is not set. Generate one with " +
        "`openssl rand -base64 32` and add it in Secrets — without it MTProto " +
        "sessions cannot be stored or read.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "TELEGRAM_MTPROTO_SESSION_ENC_KEY must decode to exactly 32 bytes " +
        "(base64 of `openssl rand -base64 32`).",
    );
  }
  cachedKey = key;
  return key;
}

// Format: base64(iv) + "." + base64(authTag) + "." + base64(ciphertext)
export function encryptSessionString(plaintext: string): string {
  const iv = crypto.randomBytes(12); // GCM standard nonce size
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSessionString(encoded: string): string {
  const [ivB64, tagB64, ciphertextB64] = encoded.split(".");
  if (!ivB64 || !tagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted session string.");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// For UI display only — never store or log the real number.
export function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 4) return "***";
  const last2 = digits.slice(-2);
  const country = digits.slice(0, Math.min(3, digits.length - 2));
  return `+${country} *** ** ${last2}`;
}
