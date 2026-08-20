import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { isMtprotoConfigured } from "../telegram-mtproto/client";
import {
  sendCode,
  verifyCode,
  verifyPassword,
  revoke,
  getStatus,
} from "../telegram-mtproto/auth";
import { listAdminChannels } from "../telegram-mtproto/discovery";

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

// Resolves the signed-in Firebase user to our internal integer user id —
// same lookup connect.ts does, duplicated here rather than shared so this
// route file stays independently readable (it's the only place besides
// connect.ts that needs it right now).
async function requireUserId(req: any, res: any): Promise<number | null> {
  const { userId: firebaseUid } = getAuth(req);
  if (!firebaseUid) {
    res.status(401).json({ error: "Tizimga kirilmagan." });
    return null;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.firebaseUid, firebaseUid))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "Profil hali sozlanmagan." });
    return null;
  }
  return user.id;
}

router.get(
  "/telegram-mtproto/status",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;
    res.json(await getStatus(userId));
  }),
);

router.post(
  "/telegram-mtproto/send-code",
  handle(async (req, res) => {
    if (!isMtprotoConfigured()) {
      res.status(503).json({
        error: "MTProto hali sozlanmagan (TELEGRAM_API_ID/HASH yo'q).",
      });
      return;
    }
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    const phone = String(req.body?.phoneNumber ?? "").trim();
    if (!phone.startsWith("+") || phone.length < 8) {
      res.status(400).json({ error: "Telefon raqam noto'g'ri formatda." });
      return;
    }

    const result = await sendCode(userId, phone);
    if (result.status === "error") {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json({ pendingId: result.pendingId });
  }),
);

router.post(
  "/telegram-mtproto/verify-code",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    const pendingId = Number(req.body?.pendingId);
    const phone = String(req.body?.phoneNumber ?? "").trim();
    const code = String(req.body?.code ?? "").trim();
    if (!pendingId || !phone || !code) {
      res.status(400).json({ error: "Ma'lumotlar to'liq emas." });
      return;
    }

    const result = await verifyCode(userId, pendingId, phone, code);
    if (result.status === "error") {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json({ status: result.status });
  }),
);

router.post(
  "/telegram-mtproto/verify-password",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    const pendingId = Number(req.body?.pendingId);
    const password = String(req.body?.password ?? "");
    if (!pendingId || !password) {
      res.status(400).json({ error: "Ma'lumotlar to'liq emas." });
      return;
    }

    const result = await verifyPassword(userId, pendingId, password);
    if (result.status === "error") {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json({ status: result.status });
  }),
);

router.get(
  "/telegram-mtproto/channels",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    const result = await listAdminChannels(userId);
    if (result.status === "not_connected") {
      res.status(409).json({ error: "MTProto hisob ulanmagan." });
      return;
    }
    if (result.status === "error") {
      res.status(500).json({ error: result.message });
      return;
    }
    res.json({ channels: result.channels });
  }),
);

router.post(
  "/telegram-mtproto/logout",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;
    await revoke(userId);
    res.json({ status: "revoked" });
  }),
);

export default router;
