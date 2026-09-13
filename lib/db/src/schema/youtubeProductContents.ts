import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { usersTable } from "./users";

// One cached YouTube content package per product content version and video format.
// Metadata is generated once and the exact 5-second MP4 is stored for reuse.
export const youtubeProductContentsTable = pgTable(
  "youtube_product_contents",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    isShort: boolean("is_short").notNull().default(false),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    tags: text("tags").notNull().default("[]"),
    hashtags: text("hashtags").notNull().default("[]"),
    // Base64-encoded MP4. The generated 5-second video is intentionally tiny.
    videoData: text("video_data"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("youtube_product_contents_version_idx").on(table.productId, table.contentHash, table.isShort),
  ],
);

export type YoutubeProductContent = typeof youtubeProductContentsTable.$inferSelect;
