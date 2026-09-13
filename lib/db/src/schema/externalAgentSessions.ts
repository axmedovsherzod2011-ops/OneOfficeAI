import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// External Agent — tashqi saytlarni (OLX.uz, Uzum Seller va h.k.) AI orqali
// boshqarish sessiyalari. OneHelp'dan farqli o'laroq, bu yerda HAR BIR
// xabar/qadam saqlanmaydi (xarajatni past ushlab turish uchun) — faqat
// sessiya tugagach, AI tomonidan yozilgan QISQA umumiy xulosa bitta qator
// sifatida yoziladi.
export const externalAgentSessionsTable = pgTable("external_agent_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  targetUrl: text("target_url"), // sessiya davomida asosan ishlangan sayt (bo'lishi shart emas)
  summary: text("summary").notNull(),
  stepCount: integer("step_count").notNull().default(0),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at").defaultNow().notNull(),
});
