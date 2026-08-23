import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, telegramChannelsTable, postsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { isMtprotoConfigured } from "../telegram-mtproto/client";
import {
  sendCode,
  resendCode,
  verifyCode,
  verifyPassword,
  revoke,
  getStatus,
} from "../telegram-mtproto/auth";
import { listAdminChannels } from "../telegram-mtproto/discovery";
import {
  getPostViews,
  getChannelSubscriberCount,
  recordMtprotoSubscriberSnapshot,
  getParityHistory,
  getMtprotoLiveStatsForUser,
  getMtprotoStatsHistoryForUser,
} from "../telegram-mtproto/stats";

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

// ---------------------------------------------------------------------------
// Account-wide, mirrors /connectors/telegram/stats/{live,history} — but
// this is the ONLY place real "views" ever comes from (see stats.ts). The
// old demo views chart in App.tsx was removed in favor of these.
// ---------------------------------------------------------------------------

router.get(
  "/telegram-mtproto/stats/live",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    const result = await getMtprotoLiveStatsForUser(userId);
    if (result.status === "not_connected") {
      res.status(409).json({ error: "MTProto hisob ulanmagan." });
      return;
    }
    if (result.status === "error") {
      res.status(500).json({ error: result.message });
      return;
    }
    res.json({
      totalSubscribers: result.totalSubscribers,
      totalViews: result.totalViews,
      channels: result.channels,
      generatedAt: new Date().toISOString(),
    });
  }),
);

router.get(
  "/telegram-mtproto/stats/history",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    const period = String(req.query.period ?? "daily");
    const daysBack =
      period === "hourly" ? 1 : period === "weekly" ? 42 : period === "monthly" ? 365 : 30;

    const snapshots = await getMtprotoStatsHistoryForUser(userId, daysBack);
    res.json({ snapshots });
  }),
);

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
    res.json({ pendingId: result.pendingId, deliveryMethod: result.deliveryMethod });
  }),
);

router.post(
  "/telegram-mtproto/resend-code",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    const pendingId = Number(req.body?.pendingId);
    const phone = String(req.body?.phoneNumber ?? "").trim();
    if (!pendingId || !phone) {
      res.status(400).json({ error: "Ma'lumotlar to'liq emas." });
      return;
    }

    const result = await resendCode(userId, pendingId, phone);
    if (result.status === "error") {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json({ deliveryMethod: result.deliveryMethod });
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

// Turns one discovered channel into a normal telegram_channels row
// (connectionType: "mtproto") so it shows up in the existing publish
// picker right alongside bot-connected channels — routes/publish.ts
// checks that column to decide which credential to send through.
// Re-resolves the channel server-side (rather than trusting whatever the
// client posts) so title/username can't be spoofed.
router.post(
  "/telegram-mtproto/channels/:mtprotoChannelId/connect",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    const mtprotoChannelId = String(req.params.mtprotoChannelId);
    const result = await listAdminChannels(userId);
    if (result.status === "not_connected") {
      res.status(409).json({ error: "MTProto hisob ulanmagan." });
      return;
    }
    if (result.status === "error") {
      res.status(500).json({ error: result.message });
      return;
    }
    const found = result.channels.find((c) => c.id === mtprotoChannelId);
    if (!found) {
      res.status(404).json({ error: "Kanal topilmadi yoki admin huquqi yo'q." });
      return;
    }

    const botChannelId = `-100${found.id}`;
    const [existing] = await db
      .select()
      .from(telegramChannelsTable)
      .where(
        and(eq(telegramChannelsTable.userId, userId), eq(telegramChannelsTable.channelId, botChannelId)),
      )
      .limit(1);

    if (existing) {
      await db
        .update(telegramChannelsTable)
        .set({
          channelTitle: found.title,
          channelUsername: found.username,
          isActive: true,
          connectionType: "mtproto",
        })
        .where(eq(telegramChannelsTable.id, existing.id));
      res.json({ channel: { ...existing, channelTitle: found.title } });
      return;
    }

    const [inserted] = await db
      .insert(telegramChannelsTable)
      .values({
        userId,
        channelId: botChannelId,
        channelUsername: found.username,
        channelTitle: found.title,
        connectionType: "mtproto",
        isActive: true,
      })
      .returning();
    res.json({ channel: inserted });
  }),
);

// Real views for one already-published post, read straight from Telegram
// via MTProto — no forward/delete workaround (see telegram/liveStats.ts).
router.get(
  "/telegram-mtproto/posts/:postId/views",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    const postId = Number(req.params.postId);
    if (!postId) {
      res.status(400).json({ error: "postId noto'g'ri." });
      return;
    }

    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId)).limit(1);
    if (!post || post.userId !== userId) {
      res.status(404).json({ error: "Post topilmadi." });
      return;
    }
    if (!post.telegramChannelId || !post.telegramMessageId) {
      res.status(400).json({ error: "Bu post Telegramga hali chop etilmagan." });
      return;
    }

    const [channel] = await db
      .select()
      .from(telegramChannelsTable)
      .where(eq(telegramChannelsTable.id, post.telegramChannelId))
      .limit(1);
    if (!channel) {
      res.status(404).json({ error: "Channel topilmadi." });
      return;
    }

    const result = await getPostViews(userId, channel.channelId, [post.telegramMessageId]);
    if (result.status === "not_connected") {
      res.status(409).json({ error: "MTProto hisob ulanmagan." });
      return;
    }
    if (result.status === "channel_not_found") {
      res.status(404).json({ error: "MTProto hisobingiz bu channel'da admin emas." });
      return;
    }
    if (result.status === "error") {
      res.status(500).json({ error: result.message });
      return;
    }
    res.json({ views: result.views.get(post.telegramMessageId) ?? 0 });
  }),
);

router.get(
  "/telegram-mtproto/channels/:telegramChannelId/subscribers",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    const telegramChannelId = Number(req.params.telegramChannelId);
    const [channel] = await db
      .select()
      .from(telegramChannelsTable)
      .where(eq(telegramChannelsTable.id, telegramChannelId))
      .limit(1);
    if (!channel || channel.userId !== userId) {
      res.status(404).json({ error: "Channel topilmadi." });
      return;
    }

    const result = await getChannelSubscriberCount(userId, channel.channelId);
    if (result.status === "not_connected") {
      res.status(409).json({ error: "MTProto hisob ulanmagan." });
      return;
    }
    if (result.status !== "ok") {
      res.status(404).json({ error: "Obunachilar sonini olishda xatolik." });
      return;
    }

    // Fire-and-forget, same pattern as the bot_api writer in
    // connectors.ts — never block the response on the snapshot write.
    recordMtprotoSubscriberSnapshot(channel.id, result.subscribers).catch((e) =>
      console.warn("[mtproto snapshot] upsert failed (non-fatal):", e),
    );

    res.json({ subscribers: result.subscribers });
  }),
);

// Stage 7: side-by-side bot_api vs mtproto subscriber history for one
// channel, so old and new can be watched together before anything is
// trusted or cut over — the "OLD VIEWS / MTProto VIEWS" table from the plan.
router.get(
  "/telegram-mtproto/channels/:telegramChannelId/parity",
  handle(async (req, res) => {
    const userId = await requireUserId(req, res);
    if (userId === null) return;

    const telegramChannelId = Number(req.params.telegramChannelId);
    const [channel] = await db
      .select()
      .from(telegramChannelsTable)
      .where(eq(telegramChannelsTable.id, telegramChannelId))
      .limit(1);
    if (!channel || channel.userId !== userId) {
      res.status(404).json({ error: "Channel topilmadi." });
      return;
    }

    const daysBack = Number(req.query.days ?? 14);
    const history = await getParityHistory(channel.id, daysBack);
    res.json({ channelTitle: channel.channelTitle, history });
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
