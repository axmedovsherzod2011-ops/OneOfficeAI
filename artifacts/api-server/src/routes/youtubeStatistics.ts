import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, youtubeAccountsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

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
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: account.refreshToken, client_id: clientId, client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "" }),
  });
  const data = await response.json() as any;
  if (!response.ok || !data.access_token) throw new Error(data.error_description ?? data.error ?? `Token refresh ${response.status}`);
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
  await db.update(youtubeAccountsTable).set({ accessToken: data.access_token, tokenExpiresAt: expiresAt }).where(eq(youtubeAccountsTable.id, account.id));
  return data.access_token as string;
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
  const channelRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(account.channelId)}`, { headers: { Authorization: `Bearer ${token}` } });
  const channelData = await channelRes.json() as any;
  if (!channelRes.ok) throw new Error(channelData?.error?.message ?? `YouTube API ${channelRes.status}`);
  const channel = channelData.items?.[0];
  if (!channel) throw new Error("YouTube kanali topilmadi.");

  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);
  const analyticsUrl = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  analyticsUrl.searchParams.set("ids", "channel==MINE");
  analyticsUrl.searchParams.set("startDate", isoDate(start));
  analyticsUrl.searchParams.set("endDate", isoDate(end));
  analyticsUrl.searchParams.set("metrics", "views,estimatedMinutesWatched,averageViewDuration,likes,comments,subscribersGained,subscribersLost");
  analyticsUrl.searchParams.set("dimensions", "day");
  analyticsUrl.searchParams.set("sort", "day");

  const analyticsRes = await fetch(analyticsUrl, { headers: { Authorization: `Bearer ${token}` } });
  const analyticsData = await analyticsRes.json() as any;
  const rows = Array.isArray(analyticsData?.rows) ? analyticsData.rows : [];

  res.json({
    account: { id: account.id, channelId: channel.id, title: channel.snippet?.title ?? account.title, customUrl: channel.snippet?.customUrl ?? account.customUrl, thumbnailUrl: channel.snippet?.thumbnails?.default?.url ?? account.thumbnailUrl },
    channel: {
      views: Number(channel.statistics?.viewCount ?? 0),
      subscribers: Number(channel.statistics?.subscriberCount ?? 0),
      videos: Number(channel.statistics?.videoCount ?? 0),
      hiddenSubscriberCount: Boolean(channel.statistics?.hiddenSubscriberCount),
    },
    analytics: {
      available: analyticsRes.ok,
      period: { startDate: isoDate(start), endDate: isoDate(end) },
      columns: analyticsData?.columnHeaders?.map((c: any) => c.name) ?? [],
      rows,
      error: analyticsRes.ok ? null : (analyticsData?.error?.message ?? `YouTube Analytics API ${analyticsRes.status}`),
    },
  });
}));

export default router;
