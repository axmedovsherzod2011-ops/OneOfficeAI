import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import {
  usersTable,
  telegramChannelsTable,
  channelStatSnapshotsTable,
} from "@workspace/db/schema";
import { and, eq, asc, gte, desc } from "drizzle-orm";
import { createLinkToken, getBotIdentity, isTelegramConfigured } from "../telegram/bot";
import { getSubscriberCount } from "../telegram/liveStats";

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
// GET /connectors/telegram/stats/live — realtime subscriber count for the
// signed-in user's connected channels. Computed fresh from the Telegram
// Bot API on every request — nothing here is read from or written to the
// database (see telegram/postTracker.ts and telegram/liveStats.ts for why).
//
// Views are intentionally NOT fetched here for now: the only way to read a
// post's view count through the Bot API is to forward it into the channel
// owner's private chat with the bot and immediately delete the forward —
// but Telegram still pushes a notification for that split-second forward,
// which the person sees and has no context for. Until real views are
// wired up properly through an MTProto session (a real Telegram login, not
// the bot), views stay demo data on the frontend and totalViews here is
// always null.
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
    void user.telegramUserId; // not used while views fetching is disabled

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
        const subscribers = await getSubscriberCount(c.channelId, c.botToken);
        return {
          id: c.id,
          channelTitle: c.channelTitle,
          subscribers,
          views: null as number | null,
        };
      }),
    );

    // Persist today's snapshot for each channel (upsert by date).
    // Fire-and-forget — never block the response on this.
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    for (const ch of perChannel) {
      if (ch.subscribers == null) continue;
      db.select()
        .from(channelStatSnapshotsTable)
        .where(
          and(
            eq(channelStatSnapshotsTable.channelRowId, ch.id),
            eq(channelStatSnapshotsTable.snapshotDate, today),
          ),
        )
        .limit(1)
        .then(async ([existing]) => {
          if (existing) {
            await db
              .update(channelStatSnapshotsTable)
              .set({ subscribers: ch.subscribers! })
              .where(eq(channelStatSnapshotsTable.id, existing.id));
          } else {
            await db.insert(channelStatSnapshotsTable).values({
              channelRowId: ch.id,
              snapshotDate: today,
              subscribers: ch.subscribers!,
            });
          }
        })
        .catch((e) =>
          console.warn("[stats snapshot] upsert failed (non-fatal):", e),
        );
    }

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

// ---------------------------------------------------------------------------
// GET /connectors/telegram/stats/history
// Returns the stored subscriber-count snapshots for the requesting user's
// channels, grouped by period (last 7 days / 30 days / 12 months).
// ---------------------------------------------------------------------------
router.get(
  "/connectors/telegram/stats/history",
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

    // How far back to look depends on the requested period.
    const period = String(req.query.period ?? "daily");
    const daysBack =
      period === "hourly"
        ? 1
        : period === "weekly"
          ? 42 // 6 weeks
          : period === "monthly"
            ? 365 // 12 months
            : 30; // "daily" → last 30 days

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Fetch snapshots for all this user's active channels.
    const channels = await db
      .select({ id: telegramChannelsTable.id })
      .from(telegramChannelsTable)
      .where(
        and(
          eq(telegramChannelsTable.userId, user.id),
          eq(telegramChannelsTable.isActive, true),
        ),
      );

    const channelIds = channels.map((c) => c.id);
    if (!channelIds.length) {
      res.json({ snapshots: [] });
      return;
    }

    // Sum across all connected channels per date so the chart shows
    // the combined subscriber count.
    const rows = await db
      .select()
      .from(channelStatSnapshotsTable)
      .where(
        and(
          gte(channelStatSnapshotsTable.snapshotDate, cutoffStr),
          // drizzle doesn't have inArray exported from pg-core yet — filter
          // in JS for the small number of channels a user typically has.
        ),
      )
      .orderBy(asc(channelStatSnapshotsTable.snapshotDate));

    // Filter to this user's channels and aggregate by date.
    const filtered = rows.filter((r) => channelIds.includes(r.channelRowId));
    const byDate: Record<string, number> = {};
    for (const r of filtered) {
      byDate[r.snapshotDate] = (byDate[r.snapshotDate] ?? 0) + r.subscribers;
    }

    // Return sorted array of { date, subscribers }.
    const snapshots = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, subscribers]) => ({ date, subscribers }));

    res.json({ snapshots });
  }),
);

export default router;
