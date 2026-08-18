import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, telegramMtprotoAccountsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  startMtprotoAuth,
  submitMtprotoCode,
  submitMtprotoPassword,
  revokeMtprotoAccount,
} from "../telegram-mtproto/auth";

const router = Router();

function handle(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error("[telegram-mtproto route]", err);
      res.status(500).json({ error: "Serverda xatolik yuz berdi." });
    }
  };
}

// Resolves the Firebase-authenticated request to our numeric users.id —
// same pattern as routes/connect.ts. Sends 401/404 itself and returns
// null if the caller should stop.
async function requireUserId(req: any, res: any): Promise<number | null> {
  const { userId: firebaseUid } = getAuth(req);
  if (!firebaseUid) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return null;
  }
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.firebaseUid, firebaseUid))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "Profil hali sozlanmagan." });
    return null;
  }
  return user.id;
}

// ---------------------------------------------------------------------------
// GET /telegram-mtproto/status — current connection state for the
// dashboard's "MTProto: Connected / Not connected" card.
// ---------------------------------------------------------------------------
router.get(
  "/telegram-mtproto/status",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    const [account] = await db
      .select({
        status: telegramMtprotoAccountsTable.status,
        phoneNumberMasked: telegramMtprotoAccountsTable.phoneNumberMasked,
        connectedAt: telegramMtprotoAccountsTable.connectedAt,
      })
      .from(telegramMtprotoAccountsTable)
      .where(eq(telegramMtprotoAccountsTable.userId, userId))
      .limit(1);

    if (!account) {
      res.json({ status: "not_connected" });
      return;
    }

    res.json(account);
  }),
);

// ---------------------------------------------------------------------------
// POST /telegram-mtproto/auth/start  { phoneNumber }
// ---------------------------------------------------------------------------
router.post(
  "/telegram-mtproto/auth/start",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    const phoneNumber = String(req.body?.phoneNumber ?? "").trim();
    if (!phoneNumber || !phoneNumber.startsWith("+")) {
      res.status(400).json({
        error: "Telefon raqami xalqaro formatda bo'lishi kerak, masalan +998901234567.",
      });
      return;
    }

    const result = await startMtprotoAuth(userId, phoneNumber);
    if (result.status === "error") {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json(result);
  }),
);

// ---------------------------------------------------------------------------
// POST /telegram-mtproto/auth/code  { code }
// ---------------------------------------------------------------------------
router.post(
  "/telegram-mtproto/auth/code",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    const code = String(req.body?.code ?? "").trim();
    if (!code) {
      res.status(400).json({ error: "Kod kiritilmadi." });
      return;
    }

    const result = await submitMtprotoCode(userId, code);
    if (result.status === "error") {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json(result);
  }),
);

// ---------------------------------------------------------------------------
// POST /telegram-mtproto/auth/password  { password }   (2FA, if enabled)
// ---------------------------------------------------------------------------
router.post(
  "/telegram-mtproto/auth/password",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    const password = String(req.body?.password ?? "");
    if (!password) {
      res.status(400).json({ error: "Parol kiritilmadi." });
      return;
    }

    const result = await submitMtprotoPassword(userId, password);
    if (result.status === "error") {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json(result);
  }),
);

// ---------------------------------------------------------------------------
// POST /telegram-mtproto/logout — revoke and clear the stored session.
// ---------------------------------------------------------------------------
router.post(
  "/telegram-mtproto/logout",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    await revokeMtprotoAccount(userId);
    res.json({ status: "revoked" });
  }),
);

export default router;
