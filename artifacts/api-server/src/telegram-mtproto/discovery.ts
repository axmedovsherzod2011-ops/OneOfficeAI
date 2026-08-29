import { Api } from "teleproto";
import { db } from "@workspace/db";
import { telegramMtprotoAccountsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createMtprotoClient } from "./client";
import { decryptSessionString } from "./sessionCrypto";

// ---------------------------------------------------------------------------
// Lists the broadcast channels the MTProto-authenticated account can
// administer (owns, or has admin rights on) — i.e. exactly the set the
// person could pick from to connect via the new flow.
//
// This is purely additive: it does NOT touch telegram_channels or the
// "make the bot an admin" flow in bot.ts/telegramWebhook.ts. A channel
// only becomes usable for the bot-based publish/webhook flow the way it
// always has — by adding the bot as admin there. Discovery here is just
// for picking which channel MTProto stats should track.
// ---------------------------------------------------------------------------

export interface DiscoveredChannel {
  id: string;
  title: string;
  username: string | null;
  membersCount: number | null;
  isCreator: boolean;
}

export type CreateChannelResult =
  | { status: "ok"; channel: DiscoveredChannel }
  | { status: "not_connected" }
  | { status: "error"; message: string };

// Creates a brand-new broadcast channel owned by the person's own Telegram
// account (channels.createChannel) — used by onboarding so a first-time
// user gets a real channel named after their business with zero manual
// Telegram setup, instead of needing an existing channel to pick from.
export async function createChannel(
  userId: number,
  title: string,
): Promise<CreateChannelResult> {
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
    const result = await client.invoke(
      new Api.channels.CreateChannel({
        title: title.slice(0, 128) || "Mening do'konim",
        about: "OneOffice AI orqali yaratildi",
        broadcast: true,
      }),
    );

    const created = (result as any)?.chats?.find((c: any) => c instanceof Api.Channel);
    if (!created) {
      return { status: "error", message: "Kanal yaratildi, lekin ma'lumotini o'qib bo'lmadi." };
    }

    await db
      .update(telegramMtprotoAccountsTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(telegramMtprotoAccountsTable.userId, userId));

    return {
      status: "ok",
      channel: {
        id: created.id.toString(),
        title: created.title,
        username: created.username ?? null,
        membersCount: created.participantsCount ?? 1,
        isCreator: true,
      },
    };
  } catch (err: any) {
    console.error("[mtproto] createChannel failed", err?.errorMessage ?? err);
    return { status: "error", message: "Kanal yaratib bo'lmadi. Birozdan so'ng qayta urining." };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

export type ListChannelsResult =
  | { status: "ok"; channels: DiscoveredChannel[] }
  | { status: "not_connected" }
  | { status: "error"; message: string };

export async function listAdminChannels(userId: number): Promise<ListChannelsResult> {
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
    const dialogs = await client.getDialogs({});

    const channels: DiscoveredChannel[] = [];
    for (const dialog of dialogs) {
      const entity = dialog.entity;
      if (!entity || !(entity instanceof Api.Channel)) continue;
      // broadcast = channel; megagroup = supergroup — we only want channels
      // here, matching what the existing Bot API flow connects.
      if (!entity.broadcast) continue;

      const canAdminister = Boolean(entity.creator) || Boolean(entity.adminRights);
      if (!canAdminister) continue;

      channels.push({
        id: entity.id.toString(),
        title: entity.title,
        username: entity.username ?? null,
        membersCount: entity.participantsCount ?? null,
        isCreator: Boolean(entity.creator),
      });
    }

    await db
      .update(telegramMtprotoAccountsTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(telegramMtprotoAccountsTable.userId, userId));

    return { status: "ok", channels };
  } catch (err: any) {
    console.error("[mtproto] listAdminChannels failed", err?.errorMessage ?? err);
    return {
      status: "error",
      message: "Kanallar ro'yxatini olishda xatolik yuz berdi.",
    };
  } finally {
    await client.disconnect().catch(() => {});
  }
}
