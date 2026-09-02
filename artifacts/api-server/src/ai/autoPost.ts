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

// Live progress, written straight into the person's OneHelp chat history as
// it happens (not just a single message at the very end) — the point of a
// background/fire-and-forget action is that a browser might not be there to
// "play back" a response, so the ONLY way to show what's happening step by
// step is to actually persist each step as its own message the moment it
// happens. The frontend picks these up via light polling while the chat is
// open (see OneHelpBubble) — same idea as Claude showing each tool call as
// it runs, adapted to a store-and-poll model instead of a live stream.
async function report(userId: number, text: string): Promise<void> {
  try {
    await db.insert(oneHelpMessagesTable).values({ userId, role: "assistant", content: text });
  } catch (err) {
    console.error("[autoPost] progress report failed to save (non-fatal)", err);
  }
}

// Same get-or-build-then-cache logic as POST /api/enrich's cached path
// (routes/enrich.ts) — a product researched once (by a normal Create Post
// use, or by a previous auto-post run) never re-runs AI/search here either.
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

// The one action type ONE_HELP_TASK_ACTION_TYPES currently has —
// productName/channelName omitted or not matching anything falls back to
// a random active product / the first connected channel; a name that DOES
// match (case-insensitive substring) targets that exact one. Reports
// progress into the chat at every stage.
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

  trackPublishedPost(channel.id, outcome.messageId);
  try {
    await db.insert(postsTable).values({
      userId,
      telegramChannelId: channel.id,
      productId: product.id,
      name: product.name,
      price: product.sellPrice,
      category: product.category,
      status: "Published",
      telegramMessageId: outcome.messageId ?? null,
      platform: "telegram",
    });
  } catch (err) {
    console.error("[autoPost] failed to record post row", err);
  }

  await report(userId, `✅ "${product.name}" muvaffaqiyatli joylandi!`);
  return { ok: true, productName: product.name, channelTitle: channel.channelTitle };
}
