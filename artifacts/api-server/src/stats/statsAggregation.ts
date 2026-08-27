import { db } from "@workspace/db";
import { channelStatSnapshotsTable } from "@workspace/db/schema";
import { and, eq, gte } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Every value in channel_stat_snapshots is a POINT-IN-TIME CUMULATIVE
// reading — subscribers is a live gauge, views is an all-time running
// total. Neither is ever a "just this period" number on its own.
//
// This module is the one place that turns those raw cumulative readings
// into period-only numbers: for any bucket, value = reading-at-bucket-end
// minus reading-at-bucket-start. That subtraction is what guarantees an
// old cumulative total can never bleed into "today"'s or "this hour"'s
// figure — the exact bug this module exists to fix.
// ---------------------------------------------------------------------------

export function hourBucketOf(d: Date): string {
  return d.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
}

export type Granularity = "hour" | "day" | "week" | "month" | "year";
export type StatsSource = "bot_api" | "mtproto";
export type StatsMetric = "subscribers" | "views";

// Exactly the windows requested: last 24 hours (hourly points), last 7 days
// (daily), last 5 weeks (weekly), last 6 months (monthly), last 5 years
// (yearly).
const BUCKET_COUNT: Record<Granularity, number> = {
  hour: 24,
  day: 7,
  week: 5,
  month: 6,
  year: 5,
};

export interface BucketWindow {
  periodStart: string; // ISO instant
  periodEnd: string; // ISO instant
}

function buildBucketWindows(granularity: Granularity, now: Date): BucketWindow[] {
  const count = BUCKET_COUNT[granularity];
  const windows: BucketWindow[] = [];

  if (granularity === "hour") {
    const nowHourStart = new Date(now);
    nowHourStart.setMinutes(0, 0, 0);
    for (let i = count - 1; i >= 0; i--) {
      const end = new Date(nowHourStart);
      end.setHours(end.getHours() - i + 1);
      const start = new Date(end);
      start.setHours(start.getHours() - 1);
      windows.push({ periodStart: start.toISOString(), periodEnd: end.toISOString() });
    }
    return windows;
  }

  if (granularity === "day") {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    for (let i = count - 1; i >= 0; i--) {
      const end = new Date(todayStart);
      end.setDate(end.getDate() - i + 1);
      const start = new Date(end);
      start.setDate(start.getDate() - 1);
      windows.push({ periodStart: start.toISOString(), periodEnd: end.toISOString() });
    }
    return windows;
  }

  if (granularity === "week") {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    for (let i = count - 1; i >= 0; i--) {
      const end = new Date(todayStart);
      end.setDate(end.getDate() - i * 7 + 1);
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      windows.push({ periodStart: start.toISOString(), periodEnd: end.toISOString() });
    }
    return windows;
  }

  if (granularity === "month") {
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      windows.push({ periodStart: start.toISOString(), periodEnd: end.toISOString() });
    }
    return windows;
  }

  // year
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear() - i, 0, 1);
    const end = new Date(now.getFullYear() - i + 1, 0, 1);
    windows.push({ periodStart: start.toISOString(), periodEnd: end.toISOString() });
  }
  return windows;
}

export interface StatsBucket extends BucketWindow {
  value: number; // NEW activity within this exact window only (a delta)
  cumulativeAtEnd: number; // the raw running total as of periodEnd, for reference
  // True when this bucket's delta is backed by a real snapshot at (or
  // before) periodStart — i.e. `value` is a genuine, trustworthy number
  // (even when that number happens to be 0, because nothing changed in
  // this window). False means periodStart predates our first-ever
  // snapshot, so `value` was forced to 0 for lack of anything to compare
  // against — that 0 means "unknown", not "no activity".
  grounded: boolean;
}

export interface StatsSummary {
  granularity: Granularity;
  metric: StatsMetric;
  source: StatsSource;
  buckets: StatsBucket[];
  // Today's and yesterday's own new activity — never each other's, and
  // never the all-time total. This is the "bugun 2k emas, bugun alohida
  // 1k" figure.
  todayValue: number;
  yesterdayValue: number;
  // Most recent known cumulative reading (subscribers gauge / all-time
  // views total).
  allTimeTotal: number;
  // True iff at least one bucket above is `grounded`. The UI uses this —
  // NOT "is every bucket's value 0?" — to decide between rendering the
  // real chart (0-valued buckets included; 0 is a legitimate, meaningful
  // reading) and showing the "hali ma'lumot yo'q" empty state (which
  // belongs only to genuinely untracked periods).
  hasGroundedHistory: boolean;
}

type Row = { capturedAt: Date; subscribers: number; views: number | null };

export async function getStatsSummary(
  channelIds: number[],
  source: StatsSource,
  metric: StatsMetric,
  granularity: Granularity,
): Promise<StatsSummary> {
  const now = new Date();
  const windows = buildBucketWindows(granularity, now);

  if (channelIds.length === 0) {
    return {
      granularity,
      metric,
      source,
      buckets: windows.map((w) => ({ ...w, value: 0, cumulativeAtEnd: 0, grounded: false })),
      todayValue: 0,
      yesterdayValue: 0,
      allTimeTotal: 0,
      hasGroundedHistory: false,
    };
  }

  // Only need history back to the earliest bucket's start (plus a little
  // slack for the "value at boundary" lookback) — bound the scan instead of
  // reading the whole table as it grows over months/years.
  const earliestNeeded = new Date(windows[0]?.periodStart ?? now);

  const rows = await db
    .select({
      channelRowId: channelStatSnapshotsTable.channelRowId,
      capturedAt: channelStatSnapshotsTable.capturedAt,
      subscribers: channelStatSnapshotsTable.subscribers,
      views: channelStatSnapshotsTable.views,
    })
    .from(channelStatSnapshotsTable)
    .where(
      and(
        eq(channelStatSnapshotsTable.source, source),
        gte(channelStatSnapshotsTable.capturedAt, earliestNeeded),
      ),
    );

  const byChannel = new Map<number, Row[]>();
  for (const r of rows) {
    if (!channelIds.includes(r.channelRowId)) continue;
    const capturedAt = new Date(r.capturedAt);
    const list = byChannel.get(r.channelRowId) ?? [];
    list.push({ capturedAt, subscribers: r.subscribers, views: r.views });
    byChannel.set(r.channelRowId, list);
  }
  for (const list of byChannel.values()) {
    list.sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  }

  // Sum, across all channels, the latest reading at-or-before `boundary`.
  // A channel with no reading yet before `boundary` contributes 0 (it
  // simply didn't exist/wasn't tracked yet at that point in time).
  function valueAt(boundary: Date): number {
    let sum = 0;
    for (const list of byChannel.values()) {
      let val: number | null = null;
      for (const r of list) {
        if (r.capturedAt.getTime() > boundary.getTime()) break;
        val = metric === "subscribers" ? r.subscribers : (r.views ?? val);
      }
      if (val != null) sum += val;
    }
    return sum;
  }

  // The earliest snapshot we actually have for each channel. Before that
  // instant, the channel's true value at any point in time is genuinely
  // unknown to us — it is NOT "0 subscribers" or "0 views", it's just
  // untracked. valueAt() above has no choice but to treat "no reading yet"
  // as a 0 contribution (there is nothing else it can do for a running
  // sum), but that means a naive (endVal - startVal) for the bucket that
  // straddles a channel's very first snapshot silently computes
  // (currentCumulativeTotal - 0) — dumping weeks of prior, untracked
  // accumulation into that single bucket as if it all happened *in* that
  // bucket. That's exactly the false "everything spiked today" chart.
  //
  // Fix: a bucket only gets a real delta once its periodStart itself is
  // at-or-after the earliest snapshot we have (i.e. both ends of the
  // subtraction are grounded in an actual reading). Any bucket whose
  // window starts before we had any tracking data yet reports value: 0 —
  // an honest "no data to compare against" rather than a fabricated jump.
  // Real, non-zero deltas start appearing naturally from the first full
  // bucket after tracking began, once two consecutive real snapshots
  // exist to subtract.
  let earliestSnapshotAt: Date | null = null;
  for (const list of byChannel.values()) {
    const first = list[0];
    if (first && (earliestSnapshotAt === null || first.capturedAt < earliestSnapshotAt)) {
      earliestSnapshotAt = first.capturedAt;
    }
  }
  function isGrounded(boundary: Date): boolean {
    return earliestSnapshotAt !== null && boundary.getTime() >= earliestSnapshotAt.getTime();
  }

  const buckets: StatsBucket[] = windows.map((w) => {
    const endVal = valueAt(new Date(w.periodEnd));
    const startVal = valueAt(new Date(w.periodStart));
    const grounded = isGrounded(new Date(w.periodStart));
    const value = grounded ? endVal - startVal : 0;
    return { ...w, value, cumulativeAtEnd: endVal, grounded };
  });

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const nowVal = valueAt(now);
  const startOfTodayVal = valueAt(startOfToday);
  const startOfYesterdayVal = valueAt(startOfYesterday);

  return {
    granularity,
    metric,
    source,
    buckets,
    todayValue: isGrounded(startOfToday) ? nowVal - startOfTodayVal : 0,
    yesterdayValue: isGrounded(startOfYesterday) ? startOfTodayVal - startOfYesterdayVal : 0,
    allTimeTotal: nowVal,
    hasGroundedHistory: buckets.some((b) => b.grounded),
  };
}

// Shared write-side helper: upsert-by-hour-bucket, used by both the HTTP
// route handlers (on-demand poll) and the hourly scheduler (background
// capture) so every writer stays consistent with the same key.
export async function recordHourlySnapshot(
  channelRowId: number,
  source: StatsSource,
  values: { subscribers?: number; views?: number },
): Promise<void> {
  const now = new Date();
  const bucket = hourBucketOf(now);
  const today = now.toISOString().slice(0, 10);

  // Small per-channel row count (at most ~1 row/hour), so filtering the
  // current hour+source in JS (rather than a 3-way SQL WHERE) matches the
  // rest of this codebase's snapshot writers.
  const rowsForChannel = await db
    .select()
    .from(channelStatSnapshotsTable)
    .where(eq(channelStatSnapshotsTable.channelRowId, channelRowId));
  const existingForBucket = rowsForChannel.find(
    (r) => r.hourBucket === bucket && r.source === source,
  );

  if (existingForBucket) {
    await db
      .update(channelStatSnapshotsTable)
      .set({
        ...(values.subscribers !== undefined ? { subscribers: values.subscribers } : {}),
        ...(values.views !== undefined ? { views: values.views } : {}),
        capturedAt: now,
      })
      .where(eq(channelStatSnapshotsTable.id, existingForBucket.id));
  } else {
    await db.insert(channelStatSnapshotsTable).values({
      channelRowId,
      snapshotDate: today,
      hourBucket: bucket,
      capturedAt: now,
      subscribers: values.subscribers ?? 0,
      views: values.views ?? null,
      source,
    });
  }
}
