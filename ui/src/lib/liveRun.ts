import type { BotStatus, ReviewItem } from './api';

// Whether the bot's current run is about this review. The run names its review (`slug`) from its
// first update on; only before that does the MR number stand in. My own MR can hold two reviews
// (its own review and the triage of its comments), so the MR number alone would mark both.
export function isLiveFor(current: BotStatus['current'] | undefined, item: Pick<ReviewItem, 'slug' | 'iid' | 'project'>) {
  if (!current) return false;
  if (current.slug) return current.slug === item.slug;
  return item.iid != null && String(item.iid) === String(current.iid) && item.project === current.project;
}

// The run in progress on this review, among every project's: the bot reviews one MR per project
// at a time, side by side. A status from before lanes has only `current`.
export function liveRunOf(status: BotStatus | null | undefined, item: Pick<ReviewItem, 'slug' | 'iid' | 'project'>): BotStatus['current'] {
  const runs = status?.running ?? (status?.current ? [status.current] : []);
  return runs.find((run) => isLiveFor(run, item)) ?? null;
}
