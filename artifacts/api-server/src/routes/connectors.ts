import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, telegramChannelsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { createLinkToken, getBotIdentity, isTelegramConfigured } from "../telegram/bot";
import { getSubscriberCount, getLatestPostViews } from "../telegram/liveStats";

const router = Router();

// So a DB/driver error comes back as JSON, not a raw HTML 500 page.
function handle(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error("[connectors route]", err);
      res.status(500).json({
        error:
          "Serverda xatolik yuz berdi. Ma'lumotlar bazasi so'nggi o'zgarishlar bilan sinxron emas bo'lishi mumkin (pnpm run push kerak bo'lishi mumkin).",
      });
    }
  };
}

async function getProfileOr404(
  firebaseUid: string,
): Promise<{ id: number } | null> {
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.firebaseUid, firebaseUid))
    .limit(1);
  return user ?? null;
}

async function getProfileWithTelegramOr404(
  firebaseUid: string,
): Promise<{ id: number; telegramUserId: string | null } | null> {
  const [user] = await db
    .select({ id: usersTable.id, telegramUserId: usersTable.telegramUserId })
    .from(usersTable)
    .where(eq(usersTable.firebaseUid, firebaseUid))
    .limit(1);
  return user ?? null;
}

function toChannelResponse(c: typeof telegramChannelsTable.$inferSelect) {
  return {
    id: c.id,
    channelId: c.channelId,
    channelUsername: c.channelUsername,
    channelTitle: c.channelTitle,
    connectedAt: c.connectedAt.toISOString(),
    isActive: c.isActive,
  };
}

// ---------------------------------------------------------------------------
// GET /connectors/telegram/config — public info the frontend needs: the
// global bot's own @username (to build the t.me deep link) and whether
// Telegram is even configured on this server yet.
// ---------------------------------------------------------------------------
router.get(
  "/connectors/telegram/config",
  handle(async (_req, res) => {
    const bot = await getBotIdentity();
    res.json({
      botUsername: bot?.username ?? null,
      configured: isTelegramConfigured() && !!bot,
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /connectors/telegram/link — generates a one-time linking token for
// the signed-in user and returns the t.me deep link that starts the bot
// with it. Opening that link and pressing Start is the entire "sign in
// with Telegram" step — no form, no token typed anywhere.
// ---------------------------------------------------------------------------
router.get(
  "/connectors/telegram/link",
  handle(async (req, res) => {
    const { userId: firebaseUid } = getAuth(req);
    if (!firebaseUid) {
      res.status(401).json({ error: "Tizimga kirilmagan." });
      return;
    }
    const user = await getProfileOr404(firebaseUid);
    if (!user) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    const bot = await getBotIdentity();
    if (!bot) {
      res.status(400).json({
        error: "Telegram hali serverda sozlanmagan (TELEGRAM_BOT_TOKEN).",
      });
      return;
    }

    const token = await createLinkToken(user.id);
    res.json({
      deepLink: `https://t.me/${bot.username}?start=${token}`,
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /connectors/telegram — list the signed-in user's connected channels
// (any number). Inactive channels (bot demoted/removed) are excluded —
// they still exist for old posts to resolve against, just hidden here.
// ---------------------------------------------------------------------------
router.get(
  "/connectors/telegram",
  handle(async (req, res) => {
    const { userId: firebaseUid } = getAuth(req);
    if (!firebaseUid) {
      res.status(401).json({ error: "Tizimga kirilmagan." });
      return;
    }
    const user = await getProfileOr404(firebaseUid);
    if (!user) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    const channels = await db
      .select()
      .from(telegramChannelsTable)
      .where(
        and(
          eq(telegramChannelsTable.userId, user.id),
          eq(telegramChannelsTable.isActive, true),
        ),
      );

    res.json(channels.map(toChannelResponse));
  }),
);

// ---------------------------------------------------------------------------
// DELETE /connectors/telegram/:id — disconnect a channel from OneOffice's
// side. (This doesn't remove the bot from the channel itself — the person
// can do that from Telegram if they also want the bot gone there.)
// ---------------------------------------------------------------------------
router.delete(
  "/connectors/telegram/:id",
  handle(async (req, res) => {
    const { userId: firebaseUid } = getAuth(req);
    if (!firebaseUid) {
      res.status(401).json({ error: "Tizimga kirilmagan." });
      return;
    }
    const user = await getProfileOr404(firebaseUid);
    if (!user) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid channel id" });
      return;
    }

    const deleted = await db
      .delete(telegramChannelsTable)
      .where(
        and(
          eq(telegramChannelsTable.id, id),
          eq(telegramChannelsTable.userId, user.id),
        ),
      )
      .returning({ id: telegramChannelsTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }

    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// GET /connectors/telegram/stats/live — realtime dashboard numbers for the
// signed-in user's connected channels: total subscribers and the views on
// each channel's latest post. Computed fresh from the Telegram Bot API on
// every request — nothing here is read from or written to the database, by
// design (see telegram/postTracker.ts and telegram/liveStats.ts for why).
// ---------------------------------------------------------------------------
router.get(
  "/connectors/telegram/stats/live",
  handle(async (req, res) => {
    const { userId: firebaseUid } = getAuth(req);
    if (!firebaseUid) {
      res.status(401).json({ error: "Tizimga kirilmagan." });
      return;
    }
    const user = await getProfileWithTelegramOr404(firebaseUid);
    if (!user) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    const channels = await db
      .select()
      .from(telegramChannelsTable)
      .where(
        and(
          eq(telegramChannelsTable.userId, user.id),
          eq(telegramChannelsTable.isActive, true),
        ),
      );

    const perChannel = await Promise.all(
      channels.map(async (c) => {
        const [subscribers, views] = await Promise.all([
          getSubscriberCount(c.channelId),
          getLatestPostViews(c.id, c.channelId, user.telegramUserId),
        ]);
        return {
          id: c.id,
          channelTitle: c.channelTitle,
          subscribers,
          views,
        };
      }),
    );

    const totalSubscribers = perChannel.reduce(
      (sum, c) => sum + (c.subscribers ?? 0),
      0,
    );
    const totalViews = perChannel.reduce(
      (sum, c) => sum + (c.views ?? 0),
      0,
    );

    res.json({
      totalSubscribers,
      totalViews,
      channels: perChannel,
      generatedAt: new Date().toISOString(),
    });
  }),
);

export default router;
