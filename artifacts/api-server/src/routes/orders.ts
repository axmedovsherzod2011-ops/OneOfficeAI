import { Router } from "express";
import { getAuth } from "../middlewares/firebaseAuthMiddleware";
import { db } from "@workspace/db";
import { usersTable, productsTable, ordersTable, ORDER_STATUSES } from "@workspace/db/schema";
import type { OrderItem, OrderStatus } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { sendTelegramMessage, escapeTelegramHtml } from "../telegram/bot";

const router = Router();

function handle(fn: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error("[orders route]", err);
      res.status(500).json({ error: "Serverda xatolik yuz berdi." });
    }
  };
}

function generateOrderNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${y}${m}${d}-${rand}`;
}

// Fire-and-forget — a notification failing (bot not configured, seller
// never linked Telegram, a transient API error) must never fail the
// buyer's checkout. This is purely a best-effort nice-to-have on top of
// an order that has already been safely written to the database and is
// always visible on the seller's own Orders page regardless.
function notifySellerOfNewOrder(
  seller: { telegramUserId: string | null },
  args: {
    orderNumber: string;
    items: OrderItem[];
    total: number;
    currency: string;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    customerComment: string | null;
  },
) {
  if (!seller.telegramUserId) return;

  const esc = escapeTelegramHtml;
  const lines = [
    `🛍 <b>Yangi buyurtma!</b>  #${esc(args.orderNumber)}`,
    "",
    ...args.items.map(
      (it) => `• ${esc(it.name)} — ${it.quantity} dona (${esc(it.price)} ${esc(it.currency)})`,
    ),
    "",
    `💰 <b>Jami: ${args.total.toLocaleString("ru-RU")} ${esc(args.currency)}</b>`,
    "",
    `👤 ${esc(args.customerName)}`,
    `📞 ${esc(args.customerPhone)}`,
    `📍 ${esc(args.customerAddress)}`,
  ];
  if (args.customerComment) {
    lines.push(`💬 ${esc(args.customerComment)}`);
  }

  void sendTelegramMessage(seller.telegramUserId, lines.join("\n"), { parseMode: "HTML" });
}

async function getUserByFirebaseUid(firebaseUid: string) {
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.firebaseUid, firebaseUid))
    .limit(1);
  return user ?? null;
}

// ---------------------------------------------------------------------------
// POST /store/:slug/orders — PUBLIC. No auth — this is the customer placing
// an order from the storefront/product page, same as checking out on Uzum,
// Ozon, Wildberries, or Amazon as a guest. Every price is recomputed here
// from the live product row — a client-supplied price/total is never
// trusted, exactly like a real checkout.
// ---------------------------------------------------------------------------
router.post(
  "/store/:slug/orders",
  handle(async (req, res) => {
    const slug = String(req.params.slug || "");
    const [seller] = await db
      .select({ id: usersTable.id, telegramUserId: usersTable.telegramUserId })
      .from(usersTable)
      .where(eq(usersTable.storeSlug, slug))
      .limit(1);
    if (!seller) {
      res.status(404).json({ error: "Do'kon topilmadi." });
      return;
    }

    const body = req.body ?? {};
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const customerName = String(body.customerName || "").trim().slice(0, 200);
    const customerPhone = String(body.customerPhone || "").trim().slice(0, 40);
    const customerAddress = String(body.customerAddress || "").trim().slice(0, 500);
    const customerComment = body.customerComment
      ? String(body.customerComment).trim().slice(0, 1000)
      : null;

    if (rawItems.length === 0) {
      res.status(400).json({ error: "Buyurtma bo'sh bo'lishi mumkin emas." });
      return;
    }
    if (!customerName || !customerPhone || !customerAddress) {
      res.status(400).json({ error: "Ism, telefon raqam va manzilni to'ldiring." });
      return;
    }

    const orderItems: OrderItem[] = [];
    let total = 0;
    let currency = "UZS";

    for (const raw of rawItems) {
      const productId = Number(raw?.productId);
      const quantity = Math.max(1, Math.min(99, Math.trunc(Number(raw?.quantity) || 1)));
      if (!Number.isInteger(productId)) continue;

      const [product] = await db
        .select()
        .from(productsTable)
        .where(
          and(
            eq(productsTable.id, productId),
            eq(productsTable.userId, seller.id),
            eq(productsTable.status, "active"),
          ),
        )
        .limit(1);
      if (!product) continue;

      const price = Number(product.sellPrice) || 0;
      total += price * quantity;
      currency = product.currency || currency;
      orderItems.push({
        productId: product.id,
        name: product.name,
        price: product.sellPrice,
        currency: product.currency || "UZS",
        quantity,
        image: product.images?.[0] ?? null,
      });
    }

    if (orderItems.length === 0) {
      res.status(400).json({ error: "Tanlangan mahsulot(lar) endi mavjud emas." });
      return;
    }

    const orderNumber = generateOrderNumber();
    await db.insert(ordersTable).values({
      orderNumber,
      userId: seller.id,
      storeSlug: slug,
      items: orderItems,
      totalAmount: String(total),
      currency,
      customerName,
      customerPhone,
      customerAddress,
      customerComment,
      status: "new",
    });

    notifySellerOfNewOrder(seller, {
      orderNumber,
      items: orderItems,
      total,
      currency,
      customerName,
      customerPhone,
      customerAddress,
      customerComment,
    });

    res.status(201).json({ orderNumber, totalAmount: String(total), currency, items: orderItems });
  }),
);

// ---------------------------------------------------------------------------
// GET /orders — AUTH. The seller's own orders, newest first. This is what
// powers the new "Buyurtmalar" page — every order any of their storefronts
// received.
// ---------------------------------------------------------------------------
router.get(
  "/orders",
  handle(async (req, res) => {
    const { userId: firebaseUid } = getAuth(req);
    if (!firebaseUid) {
      res.status(401).json({ error: "Tizimga kirilmagan." });
      return;
    }
    const user = await getUserByFirebaseUid(firebaseUid);
    if (!user) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    const orders = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.userId, user.id))
      .orderBy(desc(ordersTable.createdAt));

    res.json({ orders });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /orders/:id — AUTH. Seller advances/cancels an order's status —
// new -> confirmed -> shipped -> delivered, or cancelled at any point.
// Ownership-checked: a seller can only ever touch their own orders.
// ---------------------------------------------------------------------------
router.patch(
  "/orders/:id",
  handle(async (req, res) => {
    const { userId: firebaseUid } = getAuth(req);
    if (!firebaseUid) {
      res.status(401).json({ error: "Tizimga kirilmagan." });
      return;
    }
    const user = await getUserByFirebaseUid(firebaseUid);
    if (!user) {
      res.status(404).json({ error: "Profil hali sozlanmagan." });
      return;
    }

    const id = Number(req.params.id);
    const status = String(req.body?.status || "") as OrderStatus;
    if (!Number.isInteger(id) || !ORDER_STATUSES.includes(status)) {
      res.status(400).json({ error: "Noto'g'ri so'rov." });
      return;
    }

    const [existing] = await db
      .select({ id: ordersTable.id, userId: ordersTable.userId })
      .from(ordersTable)
      .where(eq(ordersTable.id, id))
      .limit(1);
    if (!existing || existing.userId !== user.id) {
      res.status(404).json({ error: "Buyurtma topilmadi." });
      return;
    }

    await db
      .update(ordersTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(ordersTable.id, id));

    res.json({ ok: true, status });
  }),
);

export default router;
