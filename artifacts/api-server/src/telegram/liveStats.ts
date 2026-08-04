import { getBotToken } from "./bot";
import { getLatestPostId } from "./postTracker";

// ---------------------------------------------------------------------------
// Realtime (never persisted) Telegram numbers for one connected channel:
//   - subscribers: straight getChatMemberCount call
//   - views: Bot API has no direct "views for this post" call, so we
//     forward the channel's most recently published post into the owner's
//     private chat with the bot (they already have one — they DMed the bot
//     to link their account), read the `views` field Telegram attaches to
//     the forwarded copy, then delete the forward immediately so nothing
//     lingers in their DMs.
// ---------------------------------------------------------------------------

type TelegramApiResult<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

async function callTelegram<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramApiResult<T>> {
  const res = await fetch(
    `https://api.telegram.org/bot${getBotToken()}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return (await res.json()) as TelegramApiResult<T>;
}

export async function getSubscriberCount(
  channelId: string,
): Promise<number | null> {
  try {
    const data = await callTelegram<number>("getChatMemberCount", {
      chat_id: channelId,
    });
    return data.ok && typeof data.result === "number" ? data.result : null;
  } catch {
    return null;
  }
}

// Returns the view count of the channel's latest tracked post, or null if
// there's nothing to check (no post sent yet this process, or the channel
// owner hasn't linked their Telegram account so there's nowhere to forward
// into).
export async function getLatestPostViews(
  channelRowId: number,
  channelId: string,
  ownerTelegramUserId: string | null,
): Promise<number | null> {
  const messageId = getLatestPostId(channelRowId);
  if (!messageId || !ownerTelegramUserId) return null;

  try {
    const forwarded = await callTelegram<{ message_id: number; views?: number }>(
      "forwardMessage",
      {
        chat_id: ownerTelegramUserId,
        from_chat_id: channelId,
        message_id: messageId,
      },
    );
    if (!forwarded.ok || !forwarded.result) return null;

    const views = forwarded.result.views ?? null;

    // Best-effort cleanup — a failure to delete shouldn't fail the stats
    // request, it just leaves one extra forwarded message in the owner's
    // chat with the bot.
    callTelegram("deleteMessage", {
      chat_id: ownerTelegramUserId,
      message_id: forwarded.result.message_id,
    }).catch(() => {});

    return views;
  } catch {
    return null;
  }
}
