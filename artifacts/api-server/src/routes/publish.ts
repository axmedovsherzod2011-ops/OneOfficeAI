import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  telegramChannelsTable,
  postsTable,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { getBotToken } from "../telegram/bot";
import { trackPublishedPost } from "../telegram/postTracker";

const router = Router();

type TelegramSendResult = {
  ok: boolean;
  result?: { message_id?: number } | Array<{ message_id?: number }>;
  description?: string;
};

type ResolvedImage = {
  buffer: Buffer;
  contentType: string;
  ext: string;
};

function extFromContentType(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

// ---------------------------------------------------------------------------
// Request body validation — done by hand here (not via an imported Zod
// schema) so that new fields like `imageUrls` can never be silently dropped
// by a stale/out-of-sync schema living in another package. If something is
// wrong with the body we return a clear 400 explaining exactly what.
// ---------------------------------------------------------------------------

type PublishBody = {
  userId: number;
  channelId: number;
  text: string;
  imageUrl?: string;
  imageUrls?: string[];
  // Optional — used only to populate posts.name / posts.price so this
  // publish shows up in MTProto stats (views are looked up by joining on
  // posts.telegramMessageId, see telegram-mtproto/stats.ts). Falls back to
  // sensible defaults when the caller doesn't have a product on hand.
  productId?: number;
  name?: string;
  price?: string;
  category?: string;
};

function parsePublishBody(body: unknown): PublishBody | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body is required" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.userId !== "number") {
    return { error: "userId (number) is required" };
  }
  if (typeof b.channelId !== "number") {
    return {
      error:
        "channelId (number) is required — pick which connected Telegram channel to publish to",
    };
  }
  if (typeof b.text !== "string" || !b.text.trim()) {
    return { error: "text (non-empty string) is required" };
  }

  let imageUrls: string[] | undefined;
  if (b.imageUrls !== undefined) {
    if (
      !Array.isArray(b.imageUrls) ||
      !b.imageUrls.every((u) => typeof u === "string")
    ) {
      return { error: "imageUrls must be an array of strings" };
    }
    imageUrls = b.imageUrls as string[];
  }

  let imageUrl: string | undefined;
  if (b.imageUrl !== undefined) {
    if (typeof b.imageUrl !== "string") {
      return { error: "imageUrl must be a string" };
    }
    imageUrl = b.imageUrl;
  }

  const productId = typeof b.productId === "number" ? b.productId : undefined;
  const name = typeof b.name === "string" && b.name.trim() ? b.name : undefined;
  const price = typeof b.price === "string" && b.price.trim() ? b.price : undefined;
  const category =
    typeof b.category === "string" && b.category.trim() ? b.category : undefined;

  return {
    userId: b.userId,
    channelId: b.channelId,
    text: b.text,
    imageUrl,
    imageUrls,
    productId,
    name,
    price,
    category,
  };
}

// Resolves a single image URL (either a data: URL from an upload, or an
// external URL) down to raw bytes + content type. Returns null if the image
// can't be read, so callers can decide how to degrade gracefully.
async function resolveImage(url: string): Promise<ResolvedImage | null> {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const contentType = match[1];
    const buffer = Buffer.from(match[2], "base64");
    return { buffer, contentType, ext: extFromContentType(contentType) };
  }

  // External URL (legacy/fallback) — download it ourselves first.
  // Passing an external URL straight to Telegram's send endpoints makes
  // Telegram's servers fetch it, and many scraped/hotlink-protected image
  // URLs return HTML or get blocked, producing "Bad Request: wrong type of
  // the web page content". Uploading the bytes avoids that.
  try {
    const imgRes = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/*",
      },
    });
    const contentType = imgRes.headers.get("content-type") || "";

console.log("[telegram] Image fetch:", {
  url,
  status: imgRes.status,
  ok: imgRes.ok,
  contentType,
});

if (imgRes.ok && contentType.startsWith("image/")) {
      const arrayBuffer = await imgRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return { buffer, contentType, ext: extFromContentType(contentType) };
    }
    } catch (error) {
    console.error("[telegram] Failed to resolve image:", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  console.error("[telegram] Image could not be resolved:", {
    url,
  });

  return null;
}

// Telegram truncates/rejects photo & album captions over 1024 characters
// (sendMessage text has a separate, much higher 4096 limit). Now that the
// post text includes description + extras + lifehacks etc. it can easily
// exceed that, so we split it: the part that fits rides as the caption, and
// anything left over goes out as a follow-up text message right after.
const TELEGRAM_CAPTION_LIMIT = 1024;

function splitForCaption(text: string): { caption: string; overflow: string } {
  if (text.length <= TELEGRAM_CAPTION_LIMIT) {
    return { caption: text, overflow: "" };
  }
  // Prefer cutting at the last paragraph break before the limit so we don't
  // slice a sentence in half.
  const window = text.slice(0, TELEGRAM_CAPTION_LIMIT);
  const cut = window.lastIndexOf("\n\n");
  const splitAt = cut > 0 ? cut : TELEGRAM_CAPTION_LIMIT;
  return {
    caption: text.slice(0, splitAt).trim(),
    overflow: text.slice(splitAt).trim(),
  };
}

async function sendTextMessage(
  botToken: string,
  channelId: string,
  text: string,
): Promise<{ ok: true; messageId?: number } | { ok: false; error: string }> {
  const tgRes = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channelId, text, parse_mode: "HTML" }),
    },
  );
  const tgData = (await tgRes.json()) as TelegramSendResult;
  if (!tgData.ok) {
    return {
      ok: false,
      error: `Telegram error: ${tgData.description || "Failed to send message"}`,
    };
  }
  const result = tgData.result as { message_id?: number } | undefined;
  return { ok: true, messageId: result?.message_id };
}

async function sendSinglePhoto(
  botToken: string,
  channelId: string,
  text: string,
  image: ResolvedImage,
): Promise<{ ok: true; messageId?: number } | { ok: false; error: string }> {
  const { caption, overflow } = splitForCaption(text);

  const form = new FormData();
  form.append("chat_id", channelId);
  form.append("caption", caption);
  form.append(
    "photo",
    new Blob([new Uint8Array(image.buffer)], { type: image.contentType }),
    `photo.${image.ext}`,
  );

  const tgRes = await fetch(
    `https://api.telegram.org/bot${botToken}/sendPhoto`,
    { method: "POST", body: form },
  );
  const tgData = (await tgRes.json()) as TelegramSendResult;
  if (!tgData.ok) {
    return {
      ok: false,
      error: `Telegram error: ${tgData.description || "Failed to send photo"}`,
    };
  }
  const result = tgData.result as { message_id?: number } | undefined;

  // Best-effort: if the caption didn't fit, follow up with the rest as a
  // plain message. A failure here shouldn't fail the whole publish — the
  // photo + primary caption already went through.
  if (overflow) {
    await sendTextMessage(botToken, channelId, overflow).catch(() => {});
  }

  return { ok: true, messageId: result?.message_id };
}

// Sends 2+ images as a single Telegram album (sendMediaGroup). The caption
// goes on the first item only — Telegram renders it as the album's caption.
async function sendPhotoAlbum(
  botToken: string,
  channelId: string,
  text: string,
  images: ResolvedImage[],
): Promise<{ ok: true; messageId?: number } | { ok: false; error: string }> {
  const { caption, overflow } = splitForCaption(text);

  const form = new FormData();
  form.append("chat_id", channelId);

  const media = images.map((image, i) => {
    const fieldName = `file${i}`;
    form.append(
      fieldName,
      new Blob([new Uint8Array(image.buffer)], { type: image.contentType }),
      `photo${i}.${image.ext}`,
    );
    return i === 0
      ? {
          type: "photo",
          media: `attach://${fieldName}`,
          caption,
          parse_mode: "HTML",
        }
      : { type: "photo", media: `attach://${fieldName}` };
  });
  form.append("media", JSON.stringify(media));

  const tgRes = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMediaGroup`,
    { method: "POST", body: form },
  );
  const tgData = (await tgRes.json()) as TelegramSendResult;
  if (!tgData.ok) {
    return {
      ok: false,
      error: `Telegram error: ${tgData.description || "Failed to send album"}`,
    };
  }
  const result = tgData.result as Array<{ message_id?: number }> | undefined;

  if (overflow) {
    await sendTextMessage(botToken, channelId, overflow).catch(() => {});
  }

  return { ok: true, messageId: result?.[0]?.message_id };
}

router.post("/publish", async (req, res) => {
  const parsed = parsePublishBody(req.body);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const {
    userId,
    channelId: telegramChannelRowId,
    text,
    imageUrl,
    imageUrls,
    productId,
    name,
    price,
    category,
  } = parsed;

  // imageUrls (multi-select) takes precedence when present; otherwise fall
  // back to the single legacy imageUrl. Telegram albums cap out at 10 items.
  const requestedUrls = (
    imageUrls && imageUrls.length > 0 ? imageUrls : imageUrl ? [imageUrl] : []
  ).slice(0, 10);

  // Retrieve user (for existence check) and the specific connected Telegram
  // channel they picked to publish to. Scoping the channel lookup by
  // userId too means one user can never publish through another user's
  // connected channel, even if they somehow guessed its id.
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) {
    res
      .status(404)
      .json({ error: "User not found. Please reconnect your account." });
    return;
  }

  const [channel] = await db
    .select()
    .from(telegramChannelsTable)
    .where(
      and(
        eq(telegramChannelsTable.id, telegramChannelRowId),
        eq(telegramChannelsTable.userId, userId),
        eq(telegramChannelsTable.isActive, true),
      ),
    )
    .limit(1);
  if (!channel) {
    res.status(404).json({
      error:
        "Ulangan Telegram kanal topilmadi. Iltimos, Connectors bo'limidan kanal tanlang.",
    });
    return;
  }

  const channelId = channel.channelId;
  let botToken: string;
  try {
    botToken = getBotToken();
  } catch {
    res.status(400).json({
      error: "Telegram hali serverda sozlanmagan (TELEGRAM_BOT_TOKEN).",
    });
    return;
  }

  let telegramMessageId: number | undefined;

  try {
    const resolvedImages = (
      await Promise.all(requestedUrls.map((url) => resolveImage(url)))
    ).filter((img): img is ResolvedImage => img !== null);

    let outcome:
      | { ok: true; messageId?: number }
      | { ok: false; error: string };

    if (resolvedImages.length >= 2) {
      outcome = await sendPhotoAlbum(botToken, channelId, text, resolvedImages);
    } else if (resolvedImages.length === 1) {
      outcome = await sendSinglePhoto(
        botToken,
        channelId,
        text,
        resolvedImages[0],
      );
    } else {
      // No images resolved (either none were requested, or all failed to
      // load) — fall back to a text-only post rather than failing outright.
      outcome = await sendTextMessage(botToken, channelId, text);
    }

    if (!outcome.ok) {
      res.status(400).json({ error: outcome.error });
      return;
    }
    telegramMessageId = outcome.messageId;
  } catch {
    res.status(400).json({
      error: "Failed to reach Telegram API. Check your internet connection.",
    });
    return;
  }

  // In-memory only (never the database) — lets the live stats endpoint
  // read this post's current view count on demand. See telegram/postTracker.ts.
  trackPublishedPost(telegramChannelRowId, telegramMessageId);

  // Persisted row — this is what telegram-mtproto/stats.ts joins on
  // (postsTable.telegramChannelId + telegramMessageId) to fetch real view
  // counts. Without this row the MTProto dashboard has nothing to look up
  // and always reports 0 views, even once a session is connected.
  try {
    await db.insert(postsTable).values({
      userId,
      telegramChannelId: telegramChannelRowId,
      productId,
      name: name ?? text.slice(0, 80),
      price: price ?? "0",
      category: category ?? "Electronics",
      status: "Published",
      telegramMessageId: telegramMessageId ?? null,
      platform: "telegram",
    });
  } catch (err) {
    // Never fail the publish because of the analytics write — the message
    // already went out to Telegram successfully.
    console.error("[publish] Failed to record post row:", err);
  }

  res.json({ success: true, messageId: telegramMessageId ?? 0 });
});

export default router;
