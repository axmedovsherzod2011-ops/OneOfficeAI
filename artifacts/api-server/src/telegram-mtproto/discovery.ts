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

function transliterateTelegramUsername(value: string): string {
  const map: Record<string, string> = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "x", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "",
    "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    "ў": "u", "қ": "q", "ғ": "g", "ҳ": "h", "ё": "yo",
  };

  return value
    .toLowerCase()
    .split("")
    .map((char) => map[char] ?? char)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 32);
}

function buildPublicUsernameCandidates(title: string): string[] {
  const base = transliterateTelegramUsername(title);
  if (!base) return ["oneoffice"];

  // Telegram usernames must be at least 5 characters. Prefer the shortest
  // useful name derived from the channel title, then progressively fall back
  // to longer title-derived forms if the short one is already occupied.
  const candidates = new Set<string>();
  const minLength = Math.min(5, base.length);
  if (base.length >= 5) candidates.add(base.slice(0, minLength));

  for (let length = 6; length <= Math.min(base.length, 16); length++) {
    candidates.add(base.slice(0, length));
  }
  if (base.length > 16) candidates.add(base.slice(0, 32));

  return Array.from(candidates).filter((candidate) => candidate.length >= 5 && /^[a-z][a-z0-9_]{4,31}$/.test(candidate));
}

async function tryMakePublicChannel(client: any, channel: any, title: string): Promise<string | null> {
  for (const username of buildPublicUsernameCandidates(title)) {
    try {
      await client.invoke(new Api.channels.UpdateUsername({ channel, username }));
      return username;
    } catch (err: any) {
      const errorMessage = String(err?.errorMessage ?? err?.message ?? "").toUpperCase();
      // An occupied username is expected while searching for the shortest
      // available title-derived link. Other failures should not prevent the
      // channel itself from being created.
      if (errorMessage.includes("USERNAME_OCCUPIED") || errorMessage.includes("USERNAME_INVALID") || errorMessage.includes("USERNAME_PURCHASE_AVAILABLE")) {
        continue;
      }
      console.warn("[mtproto] public username assignment failed", err?.errorMessage ?? err);
      return null;
    }
  }
  return null;
}

// Creates a brand-new broadcast channel owned by the person's own Telegram
// account. The channel is made PUBLIC automatically and receives the shortest
// available username derived from the channel/business name.
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
    const channelTitle = title.slice(0, 128) || "Mening do'konim";
    const result = await client.invoke(
      new Api.channels.CreateChannel({
        title: channelTitle,
        about: "OneOffice AI orqali yaratildi",
        broadcast: true,
      }),
    );

    const created = (result as any)?.chats?.find((c: any) => c instanceof Api.Channel);
    if (!created) {
      return { status: "error", message: "Kanal yaratildi, lekin ma'lumotini o'qib bo'lmadi." };
    }

    const username = await tryMakePublicChannel(client, created, channelTitle);
    if (!username) {
      console.warn("[mtproto] could not assign a public username; channel remains usable as a private channel", { title: channelTitle });
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
        username: username ?? created.username ?? null,
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
