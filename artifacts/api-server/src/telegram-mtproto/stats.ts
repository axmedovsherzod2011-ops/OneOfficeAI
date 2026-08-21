import { Api } from "teleproto";
import type { TelegramClient } from "teleproto";
import { db } from "@workspace/db";
import {
  telegramMtprotoAccountsTable,
  channelStatSnapshotsTable,
  telegramChannelsTable,
  postsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { createMtprotoClient } from "./client";
import { decryptSessionString } from "./sessionCrypto";

// ---------------------------------------------------------------------------
// Real per-post view counts via the raw MTProto method
// messages.getMessagesViews — this is what liveStats.ts's
// forward -> read views -> delete workaround (see telegram/liveStats.ts)
// was always meant to be replaced by (see the comment left there).
//
// Bot API channel ids look like "-1001234567890"; MTProto's Api.Channel.id
// is the same number WITHOUT the "-100" prefix. No new id needs to be
// stored anywhere for this — telegram_channels.channelId already has
// everything needed to derive it.
// ---------------------------------------------------------------------------

function botChannelIdToMtprotoId(botChannelId: string): string {
  return botChannelId.startsWith("-100") ? botChannelId.slice(4) : botChannelId;
}

async function resolveInputChannel(
  client: TelegramClient,
  botChannelId: string,
): Promise<Api.InputPeerChannel | null> {
  const targetId = botChannelIdToMtprotoId(botChannelId);
  const dialogs = await client.getDialogs({});
  for (const dialog of dialogs) {
    const entity = dialog.entity;
    if (!entity || !(entity instanceof Api.Channel)) continue;
    if (entity.id.toString() !== targetId) continue;
    if (!entity.accessHash) return null;
    return new Api.InputPeerChannel({
      channelId: entity.id,
      accessHash: entity.accessHash,
    });
  }
  return null;
}

export type PostViewsResult =
  | { status: "ok"; views: Map<number, number> }
  | { status: "not_connected" }
  | { status: "channel_not_found" }
  | { status: "error"; message: string };

// telegramMessageIds: the same posts.telegramMessageId values already
// written by publish.ts when the bot sent the post — MTProto and the bot
// see the same message ids in a channel, so nothing new needs tracking.
export async function getPostViews(
  userId: number,
  botChannelId: string,
  telegramMessageIds: number[],
): Promise<PostViewsResult> {
  if (telegramMessageIds.length === 0) {
    return { status: "ok", views: new Map() };
  }

  const [account] = await db
    .select()
    .from(telegramMtprotoAccountsTable)
    .where(eq(telegramMtprotoAccountsTable.userId, userId))
    .limit(1);

  if (!account || account.status !== "active" || !account.sessionEncrypted) {
    return { status: "not_connected" };
  }

  const client = await createMtprotoClient(decryptSessionString(account.sessionEncrypted));
  try {
    const inputChannel = await resolveInputChannel(client, botChannelId);
    if (!inputChannel) {
      return { status: "channel_not_found" };
    }

    const result = await client.invoke(
      new Api.messages.GetMessagesViews({
        peer: inputChannel,
        id: telegramMessageIds,
        increment: false, // read-only — never bump the view count ourselves
      }),
    );

    const views = new Map<number, number>();
    result.views.forEach((v, index) => {
      const messageId = telegramMessageIds[index];
      if (messageId !== undefined) views.set(messageId, v.views ?? 0);
    });

    await db
      .update(telegramMtprotoAccountsTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(telegramMtprotoAccountsTable.userId, userId));

    return { status: "ok", views };
  } catch (err: any) {
    console.error("[mtproto] getPostViews failed", err?.errorMessage ?? err);
    return { status: "error", message: "Views ma'lumotini olishda xatolik." };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

// Channel-level subscriber count, for the parallel bot_api/mtproto
// comparison in stage 7 — cross-checked against the number
// liveStats.ts already gets from the Bot API's getChatMemberCount.
export async function getChannelSubscriberCount(
  userId: number,
  botChannelId: string,
): Promise<{ status: "ok"; subscribers: number } | { status: "not_connected" | "channel_not_found" | "error" }> {
  const [account] = await db
    .select()
    .from(telegramMtprotoAccountsTable)
    .where(eq(telegramMtprotoAccountsTable.userId, userId))
    .limit(1);

  if (!account || account.status !== "active" || !account.sessionEncrypted) {
    return { status: "not_connected" };
  }

  const client = await createMtprotoClient(decryptSessionString(account.sessionEncrypted));
  try {
    const targetId = botChannelIdToMtprotoId(botChannelId);
    const dialogs = await client.getDialogs({});
    const match = dialogs
      .map((d) => d.entity)
      .find((e) => e instanceof Api.Channel && e.id.toString() === targetId) as
      | Api.Channel
      | undefined;

    if (!match) return { status: "channel_not_found" };
    return { status: "ok", subscribers: match.participantsCount ?? 0 };
  } catch (err) {
    console.error("[mtproto] getChannelSubscriberCount failed", err);
    return { status: "error" };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Stage 7 — parallel run. Writes an mtproto-sourced snapshot alongside
// whatever the bot_api writer in routes/connectors.ts already wrote for
// today, using the same upsert-by-(channel, date, source) shape so the two
// never collide (source is part of the lookup on both sides).
// ---------------------------------------------------------------------------

export async function recordMtprotoSubscriberSnapshot(
  channelRowId: number,
  subscribers: number,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const [existing] = await db
    .select()
    .from(channelStatSnapshotsTable)
    .where(
      and(
        eq(channelStatSnapshotsTable.channelRowId, channelRowId),
        eq(channelStatSnapshotsTable.snapshotDate, today),
        eq(channelStatSnapshotsTable.source, "mtproto"),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(channelStatSnapshotsTable)
      .set({ subscribers })
      .where(eq(channelStatSnapshotsTable.id, existing.id));
  } else {
    await db.insert(channelStatSnapshotsTable).values({
      channelRowId,
      snapshotDate: today,
      subscribers,
      source: "mtproto",
    });
  }
}

export interface ParityRow {
  date: string;
  botApiSubscribers: number | null;
  mtprotoSubscribers: number | null;
  // Same day, both sources present, and the numbers actually match —
  // this is the signal stage 7's plan uses to eventually decide
  // "MTProto = trusted".
  matches: boolean;
}

// Side-by-side comparison for one channel over the last N days — the
// "OLD VIEWS: 1,245 / MTProto VIEWS: 1,245" table from the plan.
export async function getParityHistory(
  channelRowId: number,
  daysBack = 14,
): Promise<ParityRow[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(channelStatSnapshotsTable)
    .where(eq(channelStatSnapshotsTable.channelRowId, channelRowId));

  const byDate = new Map<string, { botApi?: number; mtproto?: number }>();
  for (const r of rows) {
    if (r.snapshotDate < cutoffStr) continue;
    const entry = byDate.get(r.snapshotDate) ?? {};
    if (r.source === "bot_api") entry.botApi = r.subscribers;
    else if (r.source === "mtproto") entry.mtproto = r.subscribers;
    byDate.set(r.snapshotDate, entry);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      botApiSubscribers: v.botApi ?? null,
      mtprotoSubscribers: v.mtproto ?? null,
      matches: v.botApi != null && v.mtproto != null && v.botApi === v.mtproto,
    }));
}

// ---------------------------------------------------------------------------
// Stage 8 — the dashboard's "views" chart. Unlike subscribers (which the
// Bot API can already read live), real views are ONLY obtainable through
// MTProto, so this is the sole source for that chart from here on — no
// bot_api reading and no demo fallback (see App.tsx: demoSeries/DEMO_SERIES
// were removed entirely in this stage).
//
// Mirrors the shape of routes/connectors.ts's bot_api
// /connectors/telegram/stats/live + /stats/history pair: one client
// connection, one getDialogs() call, then per-channel work — so N
// channels costs one MTProto round trip for dialogs plus one
// GetMessagesViews per channel, not one per post.
// ---------------------------------------------------------------------------

export interface MtprotoChannelLiveStats {
  channelRowId: number;
  channelTitle: string;
  subscribers: number | null;
  views: number | null;
}

export type LiveStatsResult =
  | {
      status: "ok";
      totalSubscribers: number;
      totalViews: number;
      channels: MtprotoChannelLiveStats[];
    }
  | { status: "not_connected" }
  | { status: "error"; message: string };

export async function getMtprotoLiveStatsForUser(userId: number): Promise<LiveStatsResult> {
  const [account] = await db
    .select()
    .from(telegramMtprotoAccountsTable)
    .where(eq(telegramMtprotoAccountsTable.userId, userId))
    .limit(1);

  if (!account || account.status !== "active" || !account.sessionEncrypted) {
    return { status: "not_connected" };
  }

  const channels = await db
    .select()
    .from(telegramChannelsTable)
    .where(and(eq(telegramChannelsTable.userId, userId), eq(telegramChannelsTable.isActive, true)));

  if (channels.length === 0) {
    return { status: "ok", totalSubscribers: 0, totalViews: 0, channels: [] };
  }

  const client = await createMtprotoClient(decryptSessionString(account.sessionEncrypted));
  try {
    const dialogs = await client.getDialogs({});
    const entityById = new Map<string, Api.Channel>();
    for (const dialog of dialogs) {
      const entity = dialog.entity;
      if (entity instanceof Api.Channel) entityById.set(entity.id.toString(), entity);
    }

    const results: MtprotoChannelLiveStats[] = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const channel of channels) {
      const targetId = botChannelIdToMtprotoId(channel.channelId);
      const entity = entityById.get(targetId);
      const subscribers = entity?.participantsCount ?? null;

      let views: number | null = null;
      if (entity?.accessHash) {
        const posts = await db
          .select({ telegramMessageId: postsTable.telegramMessageId })
          .from(postsTable)
          .where(eq(postsTable.telegramChannelId, channel.id));
        const messageIds = posts
          .map((p) => p.telegramMessageId)
          .filter((id): id is number => id != null);

        if (messageIds.length > 0) {
          try {
            const inputPeer = new Api.InputPeerChannel({
              channelId: entity.id,
              accessHash: entity.accessHash,
            });
            const viewsResult = await client.invoke(
              new Api.messages.GetMessagesViews({
                peer: inputPeer,
                id: messageIds,
                increment: false,
              }),
            );
            views = viewsResult.views.reduce((sum, v) => sum + (v.views ?? 0), 0);
          } catch (err) {
            console.error("[mtproto] views fetch failed for channel", channel.id, err);
          }
        } else {
          views = 0;
        }
      }

      results.push({
        channelRowId: channel.id,
        channelTitle: channel.channelTitle,
        subscribers,
        views,
      });

      // Persist today's mtproto snapshot (upsert by channel+date+source),
      // same fire-and-forget-tolerant pattern used elsewhere — failures
      // here must never break the response.
      try {
        const [existing] = await db
          .select()
          .from(channelStatSnapshotsTable)
          .where(
            and(
              eq(channelStatSnapshotsTable.channelRowId, channel.id),
              eq(channelStatSnapshotsTable.snapshotDate, today),
              eq(channelStatSnapshotsTable.source, "mtproto"),
            ),
          )
          .limit(1);

        const patch = {
          ...(subscribers != null ? { subscribers } : {}),
          ...(views != null ? { views } : {}),
        };
        if (existing) {
          if (Object.keys(patch).length > 0) {
            await db
              .update(channelStatSnapshotsTable)
              .set(patch)
              .where(eq(channelStatSnapshotsTable.id, existing.id));
          }
        } else {
          await db.insert(channelStatSnapshotsTable).values({
            channelRowId: channel.id,
            snapshotDate: today,
            subscribers: subscribers ?? 0,
            views: views ?? null,
            source: "mtproto",
          });
        }
      } catch (err) {
        console.warn("[mtproto snapshot] upsert failed (non-fatal):", err);
      }
    }

    await db
      .update(telegramMtprotoAccountsTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(telegramMtprotoAccountsTable.userId, userId));

    return {
      status: "ok",
      totalSubscribers: results.reduce((sum, c) => sum + (c.subscribers ?? 0), 0),
      totalViews: results.reduce((sum, c) => sum + (c.views ?? 0), 0),
      channels: results,
    };
  } catch (err) {
    console.error("[mtproto] getMtprotoLiveStatsForUser failed", err);
    return { status: "error", message: "MTProto statistikasini olishda xatolik." };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

export interface MtprotoHistoryPoint {
  date: string;
  subscribers: number;
  views: number;
}

// Reads back the accumulated mtproto-source rows across all of a user's
// channels, summed per day — same "period -> days back" shape as the
// bot_api /connectors/telegram/stats/history route, so the frontend can
// treat both consistently. Empty until getMtprotoLiveStatsForUser has run
// at least twice on different days, exactly like the bot_api chart was
// empty on day one too.
export async function getMtprotoStatsHistoryForUser(
  userId: number,
  daysBack: number,
): Promise<MtprotoHistoryPoint[]> {
  const channels = await db
    .select({ id: telegramChannelsTable.id })
    .from(telegramChannelsTable)
    .where(and(eq(telegramChannelsTable.userId, userId), eq(telegramChannelsTable.isActive, true)));
  const channelIds = new Set(channels.map((c) => c.id));
  if (channelIds.size === 0) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(channelStatSnapshotsTable)
    .where(
      and(
        eq(channelStatSnapshotsTable.source, "mtproto"),
      ),
    );

  const byDate = new Map<string, { subscribers: number; views: number }>();
  for (const r of rows) {
    if (!channelIds.has(r.channelRowId) || r.snapshotDate < cutoffStr) continue;
    const entry = byDate.get(r.snapshotDate) ?? { subscribers: 0, views: 0 };
    entry.subscribers += r.subscribers ?? 0;
    entry.views += r.views ?? 0;
    byDate.set(r.snapshotDate, entry);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));
}
