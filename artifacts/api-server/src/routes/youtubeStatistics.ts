import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, youtubeAccountsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

function handle(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try { await fn(req, res); }
    catch (err) {
      console.error("[youtube statistics route]", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Server xatosi" });
    }
  };
}

async function getUserId(firebaseUid: string) {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.firebaseUid, firebaseUid)).limit(1);
  return user?.id ?? null;
}

async function freshToken(account: typeof youtubeAccountsTable.$inferSelect) {
  if ((account.tokenExpiresAt?.getTime() ?? 0) > Date.now() + 5 * 60 * 1000) return account.accessToken;
  if (!account.refreshToken) throw new Error("YouTube token eskirdi. Kanalni qayta ulang.");
  const clientId = (process.env.GOOGLE_CLIENT_ID ?? "").replace(/^https?:\/\//, "").trim();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refreshToken,
      client_id: clientId,
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  });
  const data = await response.json() as any;
  if (!response.ok || !data.access_token) throw new Error(data.error_description ?? data.error ?? `Token refresh ${response.status}`);
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
  await db.update(youtubeAccountsTable).set({ accessToken: data.access_token, tokenExpiresAt: expiresAt }).where(eq(youtubeAccountsTable.id, account.id));
  return data.access_token as string;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function analyticsReport(
  token: string,
  startDate: string,
  endDate: string,
  params: Record<string, string>,
) {
  const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  url.searchParams.set("ids", "channel==MINE");
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json() as any;
  if (!response.ok) {
    throw new Error(data?.error?.message ?? `YouTube Analytics API ${response.status}`);
  }
  return data;
}

async function safeReport(
  token: string,
  startDate: string,
  endDate: string,
  params: Record<string, string>,
) {
  try {
    const data = await analyticsReport(token, startDate, endDate, params);
    return {
      available: true,
      columns: data?.columnHeaders?.map((c: any) => c.name) ?? [],
      rows: Array.isArray(data?.rows) ? data.rows : [],
      error: null,
    };
  } catch (err) {
    return {
      available: false,
      columns: [],
      rows: [],
      error: err instanceof Error ? err.message : "Analytics report unavailable",
    };
  }
}

router.get("/connectors/youtube/statistics", handle(async (req, res) => {
  const { userId: firebaseUid } = getAuth(req);
  if (!firebaseUid) { res.status(401).json({ error: "Tizimga kirilmagan." }); return; }
  const userId = await getUserId(firebaseUid);
  if (!userId) { res.status(404).json({ error: "Profil hali sozlanmagan." }); return; }

  const requestedId = Number(req.query.accountId);
  const accounts = await db.select().from(youtubeAccountsTable).where(eq(youtubeAccountsTable.userId, userId));
  if (!accounts.length) { res.status(404).json({ error: "YouTube kanali ulanmagan." }); return; }
  const account = Number.isFinite(requestedId) ? accounts.find((a) => a.id === requestedId) : accounts[0];
  if (!account) { res.status(404).json({ error: "YouTube kanali topilmadi." }); return; }

  const token = await freshToken(account);
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(account.channelId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const channelData = await channelRes.json() as any;
  if (!channelRes.ok) throw new Error(channelData?.error?.message ?? `YouTube API ${channelRes.status}`);
  const channel = channelData.items?.[0];
  if (!channel) throw new Error("YouTube kanali topilmadi.");

  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  const startDate = isoDate(start);
  const endDate = isoDate(end);

  // The API exposes many independent, real analytics reports. We fetch them
  // in parallel and keep an unavailable report isolated so one unsupported
  // metric never destroys the whole statistics screen.
  const [daily, trafficSources, countries, devices, subscribedStatus, topVideos, contentTypes] = await Promise.all([
    safeReport(token, startDate, endDate, {
      metrics: "views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost,estimatedRevenue",
      dimensions: "day",
      sort: "day",
      currency: "USD",
    }),
    safeReport(token, startDate, endDate, {
      metrics: "views,estimatedMinutesWatched,averageViewDuration",
      dimensions: "insightTrafficSourceType",
      sort: "-views",
    }),
    safeReport(token, startDate, endDate, {
      metrics: "views,estimatedMinutesWatched,averageViewDuration",
      dimensions: "country",
      sort: "-views",
    }),
    safeReport(token, startDate, endDate, {
      metrics: "views,estimatedMinutesWatched,averageViewDuration",
      dimensions: "deviceType",
      sort: "-views",
    }),
    safeReport(token, startDate, endDate, {
      metrics: "views,estimatedMinutesWatched,averageViewDuration",
      dimensions: "subscribedStatus",
      sort: "-views",
    }),
    safeReport(token, startDate, endDate, {
      metrics: "views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares,subscribersGained,subscribersLost,estimatedRevenue",
      dimensions: "video",
      sort: "-views",
      maxResults: "20",
      currency: "USD",
    }),
    safeReport(token, startDate, endDate, {
      metrics: "views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares",
      dimensions: "creatorContentType",
      sort: "-views",
    }),
  ]);

  res.json({
    account: {
      id: account.id,
      channelId: channel.id,
      title: channel.snippet?.title ?? account.title,
      customUrl: channel.snippet?.customUrl ?? account.customUrl,
      thumbnailUrl: channel.snippet?.thumbnails?.default?.url ?? account.thumbnailUrl,
      publishedAt: channel.snippet?.publishedAt ?? null,
      country: channel.snippet?.country ?? null,
    },
    channel: {
      views: Number(channel.statistics?.viewCount ?? 0),
      subscribers: Number(channel.statistics?.subscriberCount ?? 0),
      videos: Number(channel.statistics?.videoCount ?? 0),
      hiddenSubscriberCount: Boolean(channel.statistics?.hiddenSubscriberCount),
    },
    analytics: {
      available: daily.available,
      period: { startDate, endDate, days: 31 },
      daily,
      trafficSources,
      countries,
      devices,
      subscribedStatus,
      topVideos,
      contentTypes,
    },
  });
}));

export default router;
