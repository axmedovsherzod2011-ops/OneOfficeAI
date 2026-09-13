import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import {
  usersTable,
  telegramChannelsTable,
  telegramMtprotoAccountsTable,
  ordersTable,
} from "@workspace/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
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

// Real money earned from orders, grouped into the same five dashboard
// granularities used by the existing charts. Amounts are stored as decimal
// text because currencies are not limited to integer values. Cancelled
// orders are excluded: they are not earned revenue.
router.get(
  "/stats/dashboard/revenue",
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

    const granularity = String(req.query.granularity ?? "day") as Granularity;
    if (!VALID_GRANULARITIES.includes(granularity)) {
      res.status(400).json({ error: "Noto'g'ri granularity." });
      return;
    }

    const now = new Date();
    const windows = buildRevenueWindows(granularity, now);
    const earliest = new Date(windows[0].periodStart);

    const rows = await db
      .select({
        createdAt: ordersTable.createdAt,
        totalAmount: ordersTable.totalAmount,
        currency: ordersTable.currency,
        status: ordersTable.status,
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.userId, resolved.userId),
          gte(ordersTable.createdAt, earliest),
        ),
      );

    const revenueRows = rows.filter((r) => r.status !== "cancelled");
    const toAmount = (value: string | null | undefined) => {
      const n = Number(value ?? 0);
      return Number.isFinite(n) ? n : 0;
    };

    function sumRange(start: Date, end: Date) {
      const totals: Record<string, number> = {};
      for (const row of revenueRows) {
        const t = new Date(row.createdAt).getTime();
        if (t >= start.getTime() && t < end.getTime()) {
          const currency = row.currency || "UZS";
          totals[currency] = (totals[currency] ?? 0) + toAmount(row.totalAmount);
        }
      }
      return totals;
    }

    const buckets = windows.map((w) => ({
      ...w,
      totals: sumRange(new Date(w.periodStart), new Date(w.periodEnd)),
    }));

    const allTimeRows = await db
      .select({ currency: ordersTable.currency, amount: sql<string>`coalesce(sum((${ordersTable.totalAmount})::numeric), 0)` })
      .from(ordersTable)
      .where(and(eq(ordersTable.userId, resolved.userId), sql`${ordersTable.status} <> 'cancelled'`))
      .groupBy(ordersTable.currency);

    const allTime: Record<string, number> = {};
    for (const row of allTimeRows) allTime[row.currency || "UZS"] = Number(row.amount ?? 0);

    res.json({ granularity, buckets, allTime });
  }),
);

function buildRevenueWindows(granularity: Granularity, now: Date) {
  const count = ({ hour: 24, day: 7, week: 5, month: 6, year: 5 } as const)[granularity];
  const windows: { periodStart: string; periodEnd: string }[] = [];

  if (granularity === "month") {
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      windows.push({ periodStart: start.toISOString(), periodEnd: end.toISOString() });
    }
    return windows;
  }
  if (granularity === "year") {
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear() - i, 0, 1);
      const end = new Date(now.getFullYear() - i + 1, 0, 1);
      windows.push({ periodStart: start.toISOString(), periodEnd: end.toISOString() });
    }
    return windows;
  }

  const unitMs = granularity === "hour" ? 60 * 60 * 1000 : granularity === "day" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const anchor = new Date(now);
  if (granularity === "hour") anchor.setMinutes(0, 0, 0);
  else anchor.setHours(0, 0, 0, 0);
  for (let i = count - 1; i >= 0; i--) {
    const end = new Date(anchor.getTime() - i * unitMs + unitMs);
    const start = new Date(end.getTime() - unitMs);
    windows.push({ periodStart: start.toISOString(), periodEnd: end.toISOString() });
  }
  return windows;
}

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
      views: viewsSummary?.buckets[i]?.value ?? 0,
      subscribers: b.value,
      orders: ordersSummary.buckets[i]?.value ?? 0,
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
