import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Every major marketplace (Uzum, Ozon, Wildberries, Amazon, Yandex Market)
// stores an order the same shape: a FROZEN snapshot of what was bought —
// name/price/image copied at order time — never a live reference to the
// product. This is deliberate: if the seller edits the product's price or
// deletes it entirely next week, every past order must still show exactly
// what the customer actually saw and paid for.
export const ORDER_STATUSES = [
  "new",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderItem {
  productId: number;
  name: string;
  price: string;
  currency: string;
  quantity: number;
  image: string | null;
}

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  // Human-readable, shown to both the customer (confirmation) and the
  // seller (orders list) — e.g. "ORD-20260826-4821".
  orderNumber: text("order_number").notNull().unique(),
  // The seller who owns the storefront this order came from.
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  storeSlug: text("store_slug").notNull(),
  items: jsonb("items").$type<OrderItem[]>().notNull().default([]),
  // Server-computed sum of item price*quantity — never trust a
  // client-supplied total, same rule real checkouts follow.
  totalAmount: text("total_amount").notNull().default("0"),
  currency: text("currency").notNull().default("UZS"),
  customerName: text("customer_name").notNull().default(""),
  customerPhone: text("customer_phone").notNull().default(""),
  customerAddress: text("customer_address").notNull().default(""),
  customerComment: text("customer_comment"),
  // new -> confirmed -> shipped -> delivered, or cancelled at any point —
  // the same lifecycle every major marketplace's order goes through.
  status: text("status", { enum: ORDER_STATUSES }).notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Order = typeof ordersTable.$inferSelect;
