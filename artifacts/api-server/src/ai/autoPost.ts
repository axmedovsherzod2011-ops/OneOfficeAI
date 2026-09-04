import { db } from "@workspace/db";
import {
  productsTable,
  productResearchTable,
  telegramChannelsTable,
  postsTable,
  oneHelpMessagesTable,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { runProductResearch, buildPostText, type ProductCard } from "./productCard";
import { sendPostToChannel } from "../routes/publish";
import { trackPublishedPost } from "../telegram/postTracker";

export type AutoPostResult =
  | { ok: true; productName: string; channelTitle: string }
  | { ok: false; error: string };

export type BulkAutoPostResult = {
  ok: boolean;
  products: number;
  channels: number;
  published: number;
  failed: number;
};

async function report(userId: number, text: string): Promise<void> {
  try {
    await db.insert(oneHelpMessagesTable).values({ userId, role: "assistant", content: text });
  } catch (err) {
    console.error("[autoPost] progress report failed to save (non-fatal)", err);
  }
}

async function getOrBuildPostText(
  product: typeof productsTable.$inferSelect,
  userId: number,
): Promise<string> {
  const [cached] = await db
    .select()
    .from(productResearchTable)
    .where(eq(productResearchTable.productId, product.id))
    .limit(1);

  if (cached && cached.status === "ready") {
    const card = cached.card as unknown as ProductCard;
    return buildPostText(product.name, product.sellPrice, card, product.deliveryInfo);
  }

  const { card, sources } = await runProductResearch({
    name: product.name,
    price: product.sellPrice,
    category: product.category,
    imageUrl: product.images?.[0],
  });

  await db
    .insert(productResearchTable)
    .values({ productId: product.id, userId, card, sources })
    .onConflictDoUpdate({
      target: productResearchTable.productId,
      set: { card, sources, status: "ready", updatedAt: new Date() },
    });

  return buildPostText(product.name, product.sellPrice, card, product.deliveryInfo);
}

async function recordPublishedPost(
  userId: number,
  product: typeof productsTable.$inferSelect,
  channel: typeof telegramChannelsTable.$inferSelect,
  messageId?: number,
): Promise<void> {
  trackPublishedPost(channel.id, messageId);
  try {
    await db.insert(postsTable).values({
      userId,
      telegramChannelId: channel.id,
      productId: product.id,
      name: product.name,
      price: product.sellPrice,
      category: product.category,
      status: "Published",
      telegramMessageId: messageId ?? null,
      platform: "telegram",
    });
  } catch (err) {
    console.error("[autoPost] failed to record post row", err);
  }
}

/**
 * Explicit bulk command: publish EVERY active product to EVERY active
 * Telegram channel. Nothing is random here. Products and channels are both
 * snapshotted first, then processed one-by-one so a failure in one pair does
 * not stop the remaining pairs.
 */
export async function runPublishAllProductsToAllChannels(userId: number): Promise<BulkAutoPostResult> {
  const activeProducts = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.userId, userId), eq(productsTable.status, "active")));

  const allChannels = await db
    .select()
    .from(telegramChannelsTable)
    .where(and(eq(telegramChannelsTable.userId, userId), eq(telegramChannelsTable.isActive, true)));

  if (activeProducts.length === 0) {
    await report(userId, "⚠️ Faol mahsulot topilmadi.");
    return { ok: false, products: 0, channels: allChannels.length, published: 0, failed: 0 };
  }
  if (allChannels.length === 0) {
    await report(userId, "⚠️ Faol Telegram kanal topilmadi.");
    return { ok: false, products: activeProducts.length, channels: 0, published: 0, failed: 0 };
  }

  const total = activeProducts.length * allChannels.length;
  let published = 0;
  let failed = 0;
  await report(userId, `🚀 ${activeProducts.length} ta mahsulotni ${allChannels.length} ta kanalning BARCHASIGA joylash boshlandi. Jami ${total} ta post.`);

  for (const product of activeProducts) {
    let postText: string;
    try {
      postText = await getOrBuildPostText(product, userId);
    } catch (err) {
      console.error("[autoPost] bulk research/build failed", { productId: product.id, err });
      failed += allChannels.length;
      await report(userId, `⚠️ "${product.name}" postini tayyorlab bo'lmadi — ${allChannels.length} ta kanal o'tkazib yuborildi.`);
      continue;
    }

    for (const channel of allChannels) {
      await report(userId, `📤 ${published + failed + 1}/${total}: "${product.name}" → "${channel.channelTitle}"`);
      try {
        const outcome = await sendPostToChannel(userId, channel, postText, product.images ?? []);
        if (!outcome.ok) {
          failed++;
          await report(userId, `⚠️ "${product.name}" → "${channel.channelTitle}" joylanmadi: ${outcome.error}`);
          continue;
        }
        published++;
        await recordPublishedPost(userId, product, channel, outcome.messageId);
        await report(userId, `✅ "${product.name}" → "${channel.channelTitle}" joylandi.`);
      } catch (err) {
        failed++;
        console.error("[autoPost] bulk publish failed", { productId: product.id, channelId: channel.id, err });
        await report(userId, `⚠️ "${product.name}" → "${channel.channelTitle}" joylashda xatolik.`);
      }
    }
  }

  await report(userId, `🏁 Tugadi: ${published} ta post joylandi, ${failed} ta postda xatolik bo'ldi.`);
  return { ok: failed === 0, products: activeProducts.length, channels: allChannels.length, published, failed };
}

export async function runPublishRandomProductPost(
  userId: number,
  productName?: string,
  channelName?: string,
): Promise<AutoPostResult> {
  await report(userId, "🔍 Mahsulot tanlanmoqda...");

  const activeProducts = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.userId, userId), eq(productsTable.status, "active")));

  if (activeProducts.length === 0) {
    const err = "Faol mahsulot topilmadi — avval kamida bitta mahsulotni faollashtiring.";
    await report(userId, `⚠️ ${err}`);
    return { ok: false, error: err };
  }

  let product = activeProducts[Math.floor(Math.random() * activeProducts.length)];
  if (productName?.trim()) {
    const needle = productName.trim().toLowerCase();
    const match = activeProducts.find((p) => p.name.toLowerCase().includes(needle));
    if (match) product = match;
  }

  await report(userId, `✍️ "${product.name}" uchun post matni tayyorlanmoqda...`);

  const allChannels = await db
    .select()
    .from(telegramChannelsTable)
    .where(and(eq(telegramChannelsTable.userId, userId), eq(telegramChannelsTable.isActive, true)));

  let channel = allChannels[0];
  if (channelName?.trim()) {
    const needle = channelName.trim().toLowerCase();
    const match = allChannels.find((c) => c.channelTitle.toLowerCase().includes(needle));
    if (match) channel = match;
  }

  if (!channel) {
    const err = "Ulangan Telegram kanal topilmadi.";
    await report(userId, `⚠️ ${err}`);
    return { ok: false, error: err };
  }

  let postText: string;
  try {
    postText = await getOrBuildPostText(product, userId);
  } catch (err) {
    console.error("[autoPost] research/build failed", err);
    const errText = "Post matnini tayyorlashda xatolik.";
    await report(userId, `⚠️ ${errText}`);
    return { ok: false, error: errText };
  }

  await report(userId, `📤 "${channel.channelTitle}" kanaliga yuborilmoqda...`);

  const outcome = await sendPostToChannel(userId, channel, postText, product.images ?? []);
  if (!outcome.ok) {
    await report(userId, `⚠️ Joylashda xatolik: ${outcome.error}`);
    return { ok: false, error: outcome.error };
  }

  await recordPublishedPost(userId, product, channel, outcome.messageId);
  await report(userId, `✅ "${product.name}" muvaffaqiyatli joylandi!`);
  return { ok: true, productName: product.name, channelTitle: channel.channelTitle };
}
