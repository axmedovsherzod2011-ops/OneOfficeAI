import { db } from "@workspace/db";
import {
  productsTable,
  productResearchTable,
  telegramChannelsTable,
  postsTable,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { runProductResearch, buildPostText, type ProductCard } from "./productCard";
import { sendPostToChannel } from "../routes/publish";
import { trackPublishedPost } from "../telegram/postTracker";

export type AutoPostResult =
  | { ok: true; productName: string; channelTitle: string }
  | { ok: false; error: string };

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

// The one action type ONE_HELP_TASK_ACTION_TYPES currently has. Picks any
// one active product at random (favors variety across repeated daily
// runs over always posting the same "first" product) and posts it to the
// user's first connected channel.
export async function runPublishRandomProductPost(userId: number): Promise<AutoPostResult> {
  const products = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.userId, userId), eq(productsTable.status, "active")));

  if (products.length === 0) {
    return { ok: false, error: "Faol mahsulot topilmadi." };
  }
  const product = products[Math.floor(Math.random() * products.length)];

  const [channel] = await db
    .select()
    .from(telegramChannelsTable)
    .where(and(eq(telegramChannelsTable.userId, userId), eq(telegramChannelsTable.isActive, true)))
    .limit(1);

  if (!channel) {
    return { ok: false, error: "Ulangan Telegram kanal topilmadi." };
  }

  let postText: string;
  try {
    postText = await getOrBuildPostText(product, userId);
  } catch (err) {
    console.error("[autoPost] research/build failed", err);
    return { ok: false, error: "Post matnini tayyorlashda xatolik." };
  }

  const outcome = await sendPostToChannel(userId, channel, postText, product.images ?? []);
  if (!outcome.ok) {
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

  return { ok: true, productName: product.name, channelTitle: channel.channelTitle };
}
