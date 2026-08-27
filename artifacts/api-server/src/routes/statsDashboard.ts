import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import {
  usersTable,
  telegramChannelsTable,
  telegramMtprotoAccountsTable,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { getStatsSummary, type Granularity, type StatsMetric } from "../stats/statsAggregation";

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

    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.firebaseUid, firebaseUid))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    const metric = String(req.query.metric ?? "subscribers") as StatsMetric;
    const granularity = String(req.query.granularity ?? "day") as Granularity;
    if (!VALID_METRICS.includes(metric) || !VALID_GRANULARITIES.includes(granularity)) {
      res.status(400).json({ error: "Noto'g'ri metric yoki granularity." });
      return;
    }

    const channels = await db
      .select({ id: telegramChannelsTable.id })
      .from(telegramChannelsTable)
      .where(and(eq(telegramChannelsTable.userId, user.id), eq(telegramChannelsTable.isActive, true)));
    const channelIds = channels.map((c) => c.id);

    const [mtprotoAccount] = await db
      .select({ status: telegramMtprotoAccountsTable.status })
      .from(telegramMtprotoAccountsTable)
      .where(eq(telegramMtprotoAccountsTable.userId, user.id))
      .limit(1);
    const mtprotoConnected = mtprotoAccount?.status === "active";

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

export default router;
