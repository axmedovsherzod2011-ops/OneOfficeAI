// ---------------------------------------------------------------------------
// Tracks the most recently published Telegram message id per connected
// channel — purely in server memory, NEVER written to the database.
//
// This exists so the "live" stats endpoint (see telegram/liveStats.ts) has
// something to forward+delete against to read a post's current view count.
// Telegram's Bot API has no "give me the views for channel X" call — the
// only way to read views is to forward the specific message and look at
// the `views` field on the returned Message, then delete the forward. That
// requires a message_id, and we deliberately don't persist message ids to
// Postgres (per product decision: this feature stays realtime-only, no
// history table).
//
// Trade-off worth knowing: this is per-process memory. The api server runs
// on Replit's autoscale target, which can spin up multiple instances or
// cold-restart an idle one — so a post published against one instance
// won't be visible to a stats request served by another, and everything
// here is lost on restart. That's an accepted limitation of keeping this
// data out of the database; worst case the live views figure is briefly
// empty/stale for a freshly-restarted instance, never wrong or stale-looking
// forever, since every new publish overwrites the entry immediately.
// ---------------------------------------------------------------------------

type TrackedPost = {
  messageId: number;
  sentAt: number;
};

const latestPostByChannel = new Map<number, TrackedPost>();

// Called by the publish route right after a successful send.
export function trackPublishedPost(
  channelRowId: number,
  messageId: number | undefined,
): void {
  if (!messageId) return;
  latestPostByChannel.set(channelRowId, { messageId, sentAt: Date.now() });
}

// Called by the live stats endpoint — returns the most recent message id
// known for this channel row, if any.
export function getLatestPostId(channelRowId: number): number | null {
  return latestPostByChannel.get(channelRowId)?.messageId ?? null;
}
