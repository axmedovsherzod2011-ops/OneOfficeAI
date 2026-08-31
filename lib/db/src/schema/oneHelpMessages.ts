import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// One row per chat turn with OneHelp — the site's own built-in assistant
// bubble (draggable, bottom-corner, opens into a chat panel). Kept simple
// on purpose for phase 1 (plain Q&A, no site-control/tool-calling yet):
// role is "user" or "assistant", content is plain text.
//
// History is permanent — never deleted — even once a later phase adds a
// "cleared daily" *display*, per the product spec: the assistant should
// always have the full history available as context, only the UI view of
// it resets. This table doesn't encode that display logic at all; it's
// just an append-only log.
export const oneHelpMessagesTable = pgTable("one_help_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
