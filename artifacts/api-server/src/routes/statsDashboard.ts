import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import {
  usersTable,
  telegramChannelsTable,
  telegramMtprotoAccountsTable,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import {
  getStatsSummary,
  getOrdersCountSummary,
  type Granularity,
  type StatsMetric,
} from "../stats/statsAggregation";

const router = Router();

function handle(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error("[stats dashboard route]", err);
      res.status(500).json({ error: "Serverda xatolik yuz berdi." });
    }
  };
}

const VALID_GRANULARITIES: Granularity[] = ["hour", "day", "week", "month", "year"];
const VALID_METRICS: StatsMetric[] = ["subscribers", "views"];

async function resolveUserAndChannels(firebaseUid: string) {
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.firebaseUid, firebaseUid))
    .limit(1);
  if (!user) return null;

  const channels = await db
    .select({ id: telegramChannelsTable.id })
    .from(telegramChannelsTable)
    .where(and(eq(telegramChannelsTable.userId, user.id), eq(telegramChannelsTable.isActive, true)));

  const [mtprotoAccount] = await db
    .select({ status: telegramMtprotoAccountsTable.status })
    .from(telegramMtprotoAccountsTable)
    .where(eq(telegramMtprotoAccountsTable.userId, user.id))
    .limit(1);

  return {
    userId: user.id,
    channelIds: channels.map((c) => c.id),
    mtprotoConnected: mtprotoAccount?.status === "active",
  };
}

// ---------------------------------------------------------------------------
// GET /api/stats/dashboard?metric=views|subscribers&granularity=hour|day|week|month|year
// (mounted under /api by app.ts — this file's own path is just
// /stats/dashboard, matching every other route file in this directory)
//
// The single source of truth for every dashboard number that claims to be
// "just this period" — today vs yesterday, last 24 hours, last 7 days,
// last 5 weeks, last 6 months, last 5 years. Every figure here is computed
// as (cumulative reading at period end) - (cumulative reading at period
// start), so an old total can never leak into what should be a period-only
// number (see statsAggregation.ts for why that matters).
//
// "views" only ever comes from MTProto (the Bot API has no real view-count
// API — see telegram/liveStats.ts) — mirrors the same source rule the rest
// of the app already uses. "subscribers" prefers MTProto when connected
// (it's the more complete channel list) and falls back to bot_api.
// ---------------------------------------------------------------------------
router.get(
  "/stats/dashboard",
  handle(async (req, res) => {
    const { userId: firebaseUid } = getAuth(req);
    if (!firebaseUid) {
      res.status(401).json({ error: "Tizimga kirilmagan." });
      return;
    }

    const resolved = await resolveUserAndChannels(firebaseUid);
    if (!resolved) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }
    const { channelIds, mtprotoConnected } = resolved;

    const metric = String(req.query.metric ?? "subscribers") as StatsMetric;
    const granularity = String(req.query.granularity ?? "day") as Granularity;
    if (!VALID_METRICS.includes(metric) || !VALID_GRANULARITIES.includes(granularity)) {
      res.status(400).json({ error: "Noto'g'ri metric yoki granularity." });
      return;
    }

    if (metric === "views" && !mtprotoConnected) {
      res.json({
        granularity,
        metric,
        source: "none",
        buckets: [],
        todayValue: 0,
        yesterdayValue: 0,
        allTimeTotal: 0,
        hasGroundedHistory: false,
        notConnected: true,
      });
      return;
    }

    const source = metric === "views" ? "mtproto" : mtprotoConnected ? "mtproto" : "bot_api";
    const summary = await getStatsSummary(channelIds, source, metric, granularity);
    res.json(summary);
  }),
);

// ---------------------------------------------------------------------------
// GET /api/stats/dashboard/combined?granularity=hour|day|week|month|year
//
// Powers the single "professional" 3-line dashboard chart: views,
// subscribers, and orders, all on the exact same time buckets so they can
// be plotted together and actually compared point-for-point. Each series
// keeps its own "grounded" flag (views/subscribers can be ungrounded —
// see statsAggregation.ts — orders never are, since counting real rows in
// a range needs no prior snapshot to be meaningful).
// ---------------------------------------------------------------------------
router.get(
  "/stats/dashboard/combined",
  handle(async (req, res) => {
    const { userId: firebaseUid } = getAuth(req);
    if (!firebaseUid) {
      res.status(401).json({ error: "Tizimga kirilmagan." });
      return;
    }

    const resolved = await resolveUserAndChannels(firebaseUid);
    if (!resolved) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }
    const { userId, channelIds, mtprotoConnected } = resolved;

    const granularity = String(req.query.granularity ?? "day") as Granularity;
    if (!VALID_GRANULARITIES.includes(granularity)) {
      res.status(400).json({ error: "Noto'g'ri granularity." });
      return;
    }

    const subscriberSource = mtprotoConnected ? "mtproto" : "bot_api";
    const [viewsSummary, subscribersSummary, ordersSummary] = await Promise.all([
      mtprotoConnected
        ? getStatsSummary(channelIds, "mtproto", "views", granularity)
        : Promise.resolve(null),
      getStatsSummary(channelIds, subscriberSource, "subscribers", granularity),
      getOrdersCountSummary(userId, granularity),
    ]);

    const buckets = subscribersSummary.buckets.map((b, i) => ({
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      views: viewsSummary?.buckets[i]?.cumulativeAtEnd ?? 0,
      subscribers: b.cumulativeAtEnd,
      orders: ordersSummary.buckets[i]?.cumulativeAtEnd ?? 0,
      viewsGrounded: viewsSummary?.buckets[i]?.grounded ?? false,
      subscribersGrounded: b.grounded,
    }));

    res.json({
      granularity,
      buckets,
      viewsConnected: mtprotoConnected,
      today: {
        views: viewsSummary?.todayValue ?? 0,
        subscribers: subscribersSummary.todayValue,
        orders: ordersSummary.todayValue,
      },
      yesterday: {
        views: viewsSummary?.yesterdayValue ?? 0,
        subscribers: subscribersSummary.yesterdayValue,
        orders: ordersSummary.yesterdayValue,
      },
      allTime: {
        views: viewsSummary?.allTimeTotal ?? 0,
        subscribers: subscribersSummary.allTimeTotal,
        orders: ordersSummary.allTimeTotal,
      },
    });
  }),
);

export default router;
