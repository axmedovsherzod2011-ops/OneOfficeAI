import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, youtubeAccountsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

const router = Router();

function handle(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error("[connector statistics]", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Server xatosi" });
    }
  };
}

async function getUserId(req: any, res: any) {
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

function googleClientId() {
  return (process.env.GOOGLE_CLIENT_ID ?? "").replace(/^https?:\\/\\//, "").trim();
}

async function freshYouTubeToken(account: typeof youtubeAccountsTable.$inferSelect) {
  const expiresAt = account.tokenExpiresAt?.getTime() ?? 0;
  if (Date.now() + 5 * 60 * 1000 < expiresAt) return account.accessToken;
  if (!account.refreshToken) throw new Error("YouTube token eskirdi. Kanalni qayta ulang.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refreshToken,
      client_id: googleClientId(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  });
  const data = await response.json() as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? `Google token refresh failed (${response.status})`);
  }
  const tokenExpiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
  await db
    .update(youtubeAccountsTable)
    .set({ accessToken: data.access_token, tokenExpiresAt })
    .where(eq(youtubeAccountsTable.id, account.id));
  return data.access_token;
}

async function googleJson(url: string, token: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message ?? `Google API ${response.status}`);
  }
  return data;
}

function dateDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function getYouTubeStats(userId: number) {
  const accounts = await db
    .select()
    .from(youtubeAccountsTable)
    .where(eq(youtubeAccountsTable.userId, userId));

  const channels = [];
  for (const account of accounts) {
    try {
      const token = await freshYouTubeToken(account);
      const channelData = await googleJson(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics,status,brandingSettings&mine=true",
        token,
      );
      const channel = channelData.items?.[0];
      if (!channel) {
        channels.push({ id: account.id, channelId: account.channelId, title: account.title, error: "YouTube kanali topilmadi." });
        continue;
      }

      const endDate = new Date().toISOString().slice(0, 10);
      const startDate = dateDaysAgo(30);
      const metrics = [
        "views",
        "estimatedMinutesWatched",
        "averageViewDuration",
        "likes",
        "comments",
        "shares",
        "subscribersGained",
        "subscribersLost",
        "engagedViews",
      ].join(",");
      const analyticsUrl = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
      analyticsUrl.searchParams.set("ids", "channel==MINE");
      analyticsUrl.searchParams.set("startDate", startDate);
      analyticsUrl.searchParams.set("endDate", endDate);
      analyticsUrl.searchParams.set("metrics", metrics);
      analyticsUrl.searchParams.set("dimensions", "day");
      analyticsUrl.searchParams.set("sort", "day");

      let analytics: any = { rows: [] };
      try {
        analytics = await googleJson(analyticsUrl.toString(), token);
      } catch (err) {
        // Channel statistics are still useful if Analytics API access is not
        // available for this account; expose the error without hiding the
        // rest of the channel data.
        analytics = { rows: [], error: err instanceof Error ? err.message : "Analytics API xatosi" };
      }

      const headers = analytics.columnHeaders?.map((h: any) => h.name) ?? [];
      const daily = (analytics.rows ?? []).map((row: any[]) => {
        const out: Record<string, any> = {};
        headers.forEach((name: string, index: number) => {
          out[name] = name === "day" ? row[index] : num(row[index]);
        });
        return out;
      });

      const totals = daily.reduce(
        (acc: any, row: any) => {
          for (const key of ["views", "estimatedMinutesWatched", "likes", "comments", "shares", "subscribersGained", "subscribersLost", "engagedViews"]) {
            acc[key] += num(row[key]);
          }
          acc.averageViewDurationWeighted += num(row.averageViewDuration) * Math.max(1, num(row.views));
          acc.averageViewDurationWeight += Math.max(1, num(row.views));
          return acc;
        },
        {
          views: 0,
          estimatedMinutesWatched: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          subscribersGained: 0,
          subscribersLost: 0,
          engagedViews: 0,
          averageViewDurationWeighted: 0,
          averageViewDurationWeight: 0,
        },
      );

      channels.push({
        id: account.id,
        channelId: channel.id,
        title: channel.snippet?.title ?? account.title,
        description: channel.snippet?.description ?? "",
        customUrl: channel.snippet?.customUrl ?? account.customUrl ?? "",
        thumbnailUrl: channel.snippet?.thumbnails?.high?.url ?? channel.snippet?.thumbnails?.default?.url ?? account.thumbnailUrl ?? "",
        publishedAt: channel.snippet?.publishedAt ?? null,
        country: channel.snippet?.country ?? null,
        defaultLanguage: channel.snippet?.defaultLanguage ?? channel.snippet?.localized?.title ? null : null,
        viewCount: num(channel.statistics?.viewCount),
        subscriberCount: num(channel.statistics?.subscriberCount),
        videoCount: num(channel.statistics?.videoCount),
        hiddenSubscriberCount: Boolean(channel.statistics?.hiddenSubscriberCount),
        commentCount: num(channel.statistics?.commentCount),
        uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads ?? null,
        analytics: {
          startDate,
          endDate,
          daily,
          totals: {
            ...totals,
            averageViewDuration: totals.averageViewDurationWeight
              ? totals.averageViewDurationWeighted / totals.averageViewDurationWeight
              : 0,
          },
          error: analytics.error ?? null,
        },
        branding: {
          channelTitle: channel.brandingSettings?.channel?.title ?? null,
          keywords: channel.brandingSettings?.channel?.keywords ?? null,
        },
        status: {
          privacyStatus: channel.status?.privacyStatus ?? null,
          isLinked: channel.status?.isLinked ?? null,
          longUploadsStatus: channel.status?.longUploadsStatus ?? null,
          madeForKids: channel.status?.madeForKids ?? null,
        },
      });
    } catch (err) {
      channels.push({
        id: account.id,
        channelId: account.channelId,
        title: account.title,
        thumbnailUrl: account.thumbnailUrl,
        error: err instanceof Error ? err.message : "YouTube statistikasi olinmadi.",
      });
    }
  }

  const totals = channels.reduce(
    (acc: any, channel: any) => {
      acc.viewCount += num(channel.viewCount);
      acc.subscriberCount += num(channel.subscriberCount);
      acc.videoCount += num(channel.videoCount);
      acc.comments30d += num(channel.analytics?.totals?.comments);
      acc.likes30d += num(channel.analytics?.totals?.likes);
      acc.shares30d += num(channel.analytics?.totals?.shares);
      acc.views30d += num(channel.analytics?.totals?.views);
      acc.watchMinutes30d += num(channel.analytics?.totals?.estimatedMinutesWatched);
      acc.subscribersGained30d += num(channel.analytics?.totals?.subscribersGained);
      acc.subscribersLost30d += num(channel.analytics?.totals?.subscribersLost);
      return acc;
    },
    { viewCount: 0, subscriberCount: 0, videoCount: 0, views30d: 0, watchMinutes30d: 0, likes30d: 0, comments30d: 0, shares30d: 0, subscribersGained30d: 0, subscribersLost30d: 0 },
  );

  return { connector: "youtube", updatedAt: new Date().toISOString(), rangeDays: 30, accounts: channels, totals };
}

router.get("/api/connectors/statistics/:connector", handle(async (req, res) => {
  const userId = await getUserId(req, res);
  if (userId === null) return;
  const connector = String(req.params.connector || "").toLowerCase();

  if (connector === "youtube") {
    res.json(await getYouTubeStats(userId));
    return;
  }

  if (connector === "telegram") {
    // The dedicated Telegram MTProto endpoint remains the source of truth;
    // the statistics page calls it directly so its live/permission logic is
    // not duplicated here.
    res.json({ connector: "telegram", delegatedEndpoint: "/api/telegram-mtproto/stats/live", message: "Telegram statistikasi uchun live MTProto endpoint ishlatiladi." });
    return;
  }

  if (connector === "instagram" || connector === "vk") {
    res.json({ connector, accounts: [], totals: {}, available: false, message: `${connector === "instagram" ? "Instagram" : "VK"} uchun ulangan akkaunt ma'lumotlari mavjud, ammo hozirgi connector scope real analytics endpointini bermaydi.` });
    return;
  }

  res.status(404).json({ error: "Noma'lum connector." });
}));

export default router;
