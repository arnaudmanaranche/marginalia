import type { BotStatus, ReviewItem } from './api';
import type { Cue } from './sounds';

// What the list and the bot's status say, reduced to what a sound answers to.
export interface Snapshot {
  slugs: Set<string>;
  // slug -> when its report was written
  reviewedAt: Map<string, string>;
  // slug -> why the last run failed (needs a person, not retried on its own)
  failed: Set<string>;
  // `<project>:<iid>` of my MRs a reviewer wrote on since the last triage
  commented: Set<string>;
}

export function snapshot(items: ReviewItem[], status: BotStatus | null): Snapshot {
  const mine = new Set(items.filter((i) => i.kind === 'comments' && i.iid !== null).map((i) => `${i.project}:${i.iid}`));
  return {
    slugs: new Set(items.map((i) => i.slug)),
    reviewedAt: new Map(items.filter((i) => !i.awaiting).map((i) => [i.slug, i.reviewedAt])),
    failed: new Set(items.filter((i) => i.failure && !i.failure.transient).map((i) => i.slug)),
    commented: new Set((status?.mrs ?? []).filter((m) => m.status === 'pending' && mine.has(`${m.project}:${m.iid}`)).map((m) => `${m.project}:${m.iid}`)),
  };
}

// The sounds a change of the list calls for, at most one of each. The first snapshot (`before`
// null) is what was there when the page opened: nothing in it is news.
export function cuesBetween(before: Snapshot | null, after: Snapshot): Cue[] {
  if (!before) return [];
  const cues = new Set<Cue>();
  for (const s of after.slugs) if (!before.slugs.has(s)) cues.add('arrive');
  for (const [s, at] of after.reviewedAt) {
    const was = before.reviewedAt.get(s);
    if (was !== undefined && was !== at) cues.add('done');
    if (was === undefined && before.slugs.has(s)) cues.add('done');
  }
  for (const s of after.failed) if (!before.failed.has(s)) cues.add('failed');
  for (const k of after.commented) if (!before.commented.has(k)) cues.add('comment');
  return [...cues];
}
