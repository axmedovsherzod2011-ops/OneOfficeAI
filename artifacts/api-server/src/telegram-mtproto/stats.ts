import { Api } from "teleproto";
import type { TelegramClient } from "teleproto";
import { db } from "@workspace/db";
import { telegramMtprotoAccountsTable, channelStatSnapshotsTable } from "@workspace/db/schema";
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
