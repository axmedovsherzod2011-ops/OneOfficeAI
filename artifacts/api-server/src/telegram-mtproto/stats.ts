import { Api } from "teleproto";
import type { TelegramClient } from "teleproto";
import { db } from "@workspace/db";
import { telegramMtprotoAccountsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
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
