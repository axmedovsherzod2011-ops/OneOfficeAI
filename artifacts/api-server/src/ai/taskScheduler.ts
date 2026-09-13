import { db } from "@workspace/db";
import { oneHelpTasksTable, oneHelpMessagesTable } from "@workspace/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { runPublishRandomProductPost } from "./autoPost";

// Tashkent is UTC+5 year-round (no DST) — this whole product's audience,
// so a single fixed offset is enough for now rather than per-user timezone
// settings. Returns the next UTC instant matching that Tashkent-local
// "HH:mm", strictly after `after` (so a task due right now correctly rolls
// to tomorrow, not an instant in the past that would just fire again next
// poll).
function nextTashkentDailyRun(timeOfDay: string, after: Date): Date {
  const [hh, mm] = timeOfDay.split(":").map(Number);
  const utcHour = hh - 5;
  const candidate = new Date(
    Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate(), utcHour, mm, 0, 0),
  );
  if (candidate.getTime() <= after.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate;
}

async function executeTask(task: typeof oneHelpTasksTable.$inferSelect): Promise<void> {
  let result: { ok: true; productName: string; channelTitle: string } | { ok: false; error: string };
  try {
    if (task.actionType === "publish_random_product_post") {
      result = await runPublishRandomProductPost(task.userId);
    } else {
      result = { ok: false, error: "Noma'lum amal turi." };
    }
  } catch (err) {
    console.error("[oneHelpTaskScheduler] task execution threw", err);
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const now = new Date();
  if (task.kind === "once") {
    await db
      .update(oneHelpTasksTable)
      .set({
        status: result.ok ? "done" : "failed",
        lastRunAt: now,
        lastError: result.ok ? null : result.error,
      })
      .where(eq(oneHelpTasksTable.id, task.id));
  } else {
    // Daily — ALWAYS advance to tomorrow's occurrence regardless of
    // success or failure. Leaving nextRunAt in the past on failure would
    // mean the next poll (60s later) tries again immediately, and again,
    // and again — a retry storm. Trying once a day, even after a failure,
    // is the right cadence for "post something every evening", not
    // "hammer it every minute until it works".
    const next = nextTashkentDailyRun(task.timeOfDay!, now);
    await db
      .update(oneHelpTasksTable)
      .set({ nextRunAt: next, lastRunAt: now, lastError: result.ok ? null : result.error })
      .where(eq(oneHelpTasksTable.id, task.id));
  }

  // Leaves a visible trace in the person's OneHelp chat history — the
  // whole point of a background task is they weren't watching when it
  // ran, so the record needs to be there when they next open the chat,
  // not just in a server log only I can see.
  const message = result.ok
    ? `"${result.productName}" mahsuloti "${result.channelTitle}" kanaliga muvaffaqiyatli joylandi.`
    : `Rejalashtirilgan vazifani bajarishda muammo chiqdi: ${result.error}`;
  try {
    await db.insert(oneHelpMessagesTable).values({ userId: task.userId, role: "assistant", content: message });
  } catch (err) {
    console.error("[oneHelpTaskScheduler] failed to log task outcome to chat", err);
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startOneHelpTaskScheduler(): void {
  if (pollTimer) return; // idempotent — never double-schedule
  pollTimer = setInterval(async () => {
    let due: (typeof oneHelpTasksTable.$inferSelect)[];
    try {
      due = await db
        .select()
        .from(oneHelpTasksTable)
        .where(and(eq(oneHelpTasksTable.status, "active"), lte(oneHelpTasksTable.nextRunAt, new Date())));
    } catch (err) {
      console.error("[oneHelpTaskScheduler] poll query failed", err);
      return;
    }
    for (const task of due) {
      await executeTask(task);
    }
  }, 60_000);
}
