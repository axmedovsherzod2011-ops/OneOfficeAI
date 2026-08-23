import { Api, type TelegramClient } from "teleproto";
import { db } from "@workspace/db";
import { telegramMtprotoAccountsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createMtprotoClient } from "./client";
import { decryptSessionString } from "./sessionCrypto";
import { resolveInputChannel } from "./stats";

// ---------------------------------------------------------------------------
// The MTProto counterpart to routes/publish.ts's bot-token sender —
// used only for telegram_channels rows with connectionType === "mtproto"
// (channels connected via the user's own account, see
// telegram-mtproto/discovery.ts + the /connect route). Bot-connected
// channels keep going through the bot exactly as before; nothing here
// changes that path.
// ---------------------------------------------------------------------------

// Same 1024-char Telegram caption limit routes/publish.ts already works
// around for the bot path — duplicated here (rather than imported) so this
// module has no dependency on the Express route file.
const TELEGRAM_CAPTION_LIMIT = 1024;

function splitForCaption(text: string): { caption: string; overflow: string } {
  if (text.length <= TELEGRAM_CAPTION_LIMIT) {
    return { caption: text, overflow: "" };
  }
  const window = text.slice(0, TELEGRAM_CAPTION_LIMIT);
  const cut = window.lastIndexOf("\n\n");
  const splitAt = cut > 0 ? cut : TELEGRAM_CAPTION_LIMIT;
  return {
    caption: text.slice(0, splitAt).trim(),
    overflow: text.slice(splitAt).trim(),
  };
}

export type MtprotoPublishImage = { buffer: Buffer; ext: string };

export type MtprotoPublishResult =
  | { ok: true; messageId: number }
  | { ok: false; error: string };

export async function publishViaMtproto(
  userId: number,
  botChannelId: string,
  text: string,
  images: MtprotoPublishImage[],
): Promise<MtprotoPublishResult> {
  const [account] = await db
    .select()
    .from(telegramMtprotoAccountsTable)
    .where(eq(telegramMtprotoAccountsTable.userId, userId))
    .limit(1);

  if (!account || account.status !== "active" || !account.sessionEncrypted) {
    return {
      ok: false,
      error: "MTProto hisob ulanmagan. Sozlamalar bo'limidan qayta ulang.",
    };
  }

  const client: TelegramClient = await createMtprotoClient(
    decryptSessionString(account.sessionEncrypted),
  );
  try {
    const inputPeer = await resolveInputChannel(client, botChannelId);
    if (!inputPeer) {
      return {
        ok: false,
        error:
          "MTProto hisobingiz bu kanalda topilmadi — admin huquqi olib tashlangan bo'lishi mumkin.",
      };
    }

    let sent: Api.Message;

    if (images.length === 0) {
      sent = await client.sendMessage(inputPeer, { message: text, parseMode: "html" });
    } else if (images.length === 1) {
      const { caption, overflow } = splitForCaption(text);
      const file = Object.assign(images[0].buffer, {
        name: `photo.${images[0].ext}`,
      });
      sent = await client.sendFile(inputPeer, { file, caption, parseMode: "html" });
      if (overflow) {
        await client
          .sendMessage(inputPeer, { message: overflow, parseMode: "html" })
          .catch(() => {});
      }
    } else {
      const { caption, overflow } = splitForCaption(text);
      const files = images.map((img, i) =>
        Object.assign(img.buffer, { name: `photo${i}.${img.ext}` }),
      );
      // Only the first item's caption is shown by Telegram for an album —
      // same convention as routes/publish.ts's sendPhotoAlbum.
      const captions = images.map((_, i) => (i === 0 ? caption : ""));
      const sentList = await client.sendFile(inputPeer, {
        file: files,
        caption: captions,
        parseMode: "html",
      });
      sent = Array.isArray(sentList) ? sentList[0] : sentList;
      if (overflow) {
        await client
          .sendMessage(inputPeer, { message: overflow, parseMode: "html" })
          .catch(() => {});
      }
    }

    await db
      .update(telegramMtprotoAccountsTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(telegramMtprotoAccountsTable.userId, userId));

    return { ok: true, messageId: sent.id };
  } catch (err: any) {
    console.error("[mtproto] publishViaMtproto failed", err?.errorMessage ?? err);
    return {
      ok: false,
      error: `MTProto orqali yuborilmadi: ${err?.errorMessage ?? "noma'lum xatolik"}`,
    };
  } finally {
    await client.disconnect().catch(() => {});
  }
}
