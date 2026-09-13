import { db } from "@workspace/db";
import { productsTable, ordersTable, telegramChannelsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { getStatsSummary } from "../stats/statsAggregation";

// A compact, real-data snapshot injected into OneHelp's prompt every turn
// so it can answer actual business questions ("nechta buyurtmam bor",
// "bugun necha ko'rish oldim", "eng arzon mahsulotim qaysi") accurately
// instead of guessing — and so it has real product/channel names to match
// against for actions. Deliberately capped everywhere (products, orders,
// channels all limited, every string truncated) — an unbounded snapshot
// here is exactly what caused the 413 "payload too large" bug fixed last
// time; this must never regress that.
export async function buildBusinessSnapshot(userId: number): Promise<string> {
  const [products, recentOrders, channels] = await Promise.all([
    db
      .select({
        name: productsTable.name,
        category: productsTable.category,
        sellPrice: productsTable.sellPrice,
        currency: productsTable.currency,
        status: productsTable.status,
      })
      .from(productsTable)
      .where(eq(productsTable.userId, userId))
      .limit(30),
    db
      .select({
        orderNumber: ordersTable.orderNumber,
        status: ordersTable.status,
        totalAmount: ordersTable.totalAmount,
        currency: ordersTable.currency,
        customerName: ordersTable.customerName,
        createdAt: ordersTable.createdAt,
      })
      .from(ordersTable)
      .where(eq(ordersTable.userId, userId))
      .orderBy(desc(ordersTable.createdAt))
      .limit(10),
    db
      .select({ id: telegramChannelsTable.id, title: telegramChannelsTable.channelTitle })
      .from(telegramChannelsTable)
      .where(eq(telegramChannelsTable.userId, userId)),
  ]);

  const lines: string[] = [];

  if (products.length === 0) {
    lines.push("Mahsulotlar: hali yo'q.");
  } else {
    const active = products.filter((p) => p.status === "active");
    const draft = products.filter((p) => p.status === "draft");
    lines.push(
      `Mahsulotlar (${products.length} ta, ${active.length} faol, ${draft.length} qoralama): ` +
        products
          .slice(0, 20)
          .map((p) => `${p.name} (${p.sellPrice} ${p.currency}, ${p.status === "active" ? "faol" : "qoralama"})`)
          .join("; "),
    );
  }

  if (channels.length === 0) {
    lines.push("Telegram kanallar: ulanmagan.");
  } else {
    lines.push(`Ulangan kanallar: ${channels.map((c) => c.title).join(", ")}.`);
  }

  if (recentOrders.length === 0) {
    lines.push("Buyurtmalar: hali yo'q.");
  } else {
    lines.push(
      `So'nggi buyurtmalar (${recentOrders.length} ta ko'rsatilgan): ` +
        recentOrders
          .slice(0, 5)
          .map((o) => `#${o.orderNumber} ${o.customerName} — ${o.totalAmount} ${o.currency} (${o.status})`)
          .join("; "),
    );
  }

  try {
    if (channels.length > 0) {
      const subs = await getStatsSummary(
        channels.map((c) => c.id),
        "bot_api",
        "subscribers",
        "day",
      );
      lines.push(
        `Bugungi obunachilar o'sishi: ${subs.todayValue}, kecha: ${subs.yesterdayValue}, jami: ${subs.allTimeTotal}.`,
      );
    }
  } catch {
    // stats are a nice-to-have here — never block the whole snapshot on them
  }

  return lines.join("\n").slice(0, 1800);
}
