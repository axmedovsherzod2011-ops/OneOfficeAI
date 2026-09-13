import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A background task OneHelp is running on the person's behalf — created the
// moment they ask for it in chat (no confirmation step, per spec: the
// person explicitly wants "vaqtimni tejamoqchimi? bo'ldi, AI tushunadi va
// bg da bajaradi" — no permission gate for this class of action). Runs
// independent of any browser tab being open; see ai/taskScheduler.ts for
// the actual polling loop that executes these.
export const ONE_HELP_TASK_KINDS = ["once", "daily"] as const;
export const ONE_HELP_TASK_STATUSES = ["active", "paused", "done", "failed"] as const;
// The only real, safely-automatable action this phase supports. Kept as a
// text enum (not a free-form string) on purpose — the scheduler's execute
// step is a switch over known action types, never arbitrary AI-authored
// code, so this list is also the whole security boundary of what a
// background task can actually do.
export const ONE_HELP_TASK_ACTION_TYPES = ["publish_random_product_post"] as const;

export const oneHelpTasksTable = pgTable("one_help_tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // Human-readable summary shown back to the person in chat and (later)
  // any task-list UI — e.g. "Har kuni soat 20:00 da tasodifiy mahsulot
  // posti". Not used by the scheduler itself, purely descriptive.
  description: text("description").notNull(),
  actionType: text("action_type", { enum: ONE_HELP_TASK_ACTION_TYPES }).notNull(),
  kind: text("kind", { enum: ONE_HELP_TASK_KINDS }).notNull(),
  // For kind="daily": the local time of day to run, "HH:mm", interpreted in
  // Asia/Tashkent (this product's whole audience) — not a user-configurable
  // timezone yet. For kind="once": null (runAt/nextRunAt carries the time).
  timeOfDay: text("time_of_day"),
  status: text("status", { enum: ONE_HELP_TASK_STATUSES }).notNull().default("active"),
  // The scheduler's poll query is just "status='active' AND nextRunAt <=
  // now()" — this column is the entire scheduling mechanism. Advanced to
  // the next occurrence after every run (see taskScheduler.ts), or the row
  // flips to status="done"/"failed" for a one-off task instead.
  nextRunAt: timestamp("next_run_at").notNull(),
  lastRunAt: timestamp("last_run_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
