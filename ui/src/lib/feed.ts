import type { Job, ReviewItem } from './api';
import { groupOf, type GroupId } from './dashboard';

// What Home's feed lists (ADR 0007). Pure.

// The turns that wait on me, in the order they are worth doing: a first look, what came back, a review
// to send, then comments on my own MRs. Waiting on others, done and own reviews are not mine to act on.
const MINE: GroupId[] = ['first', 'returned', 'unsent', 'mine'];
export const REASON: Partial<Record<GroupId, string>> = { first: 'First review', returned: 'Returned to you', unsent: 'Review to send', mine: 'Comments on your MR' };

export function reviewsNeedingYou(items: ReviewItem[]): { item: ReviewItem; reason: string }[] {
  const withGroup = items.map((item) => ({ item, group: groupOf(item) })).filter((x): x is { item: ReviewItem; group: GroupId } => x.group !== null && MINE.includes(x.group));
  return withGroup.sort((a, b) => MINE.indexOf(a.group) - MINE.indexOf(b.group)).map(({ item, group }) => ({ item, reason: REASON[group]! }));
}

// The jobs whose latest run failed for a reason that does not pass by itself: a person has to look.
export function failuresNeedingYou(jobs: Job[]): Job[] {
  const latest = new Map<string, Job>();
  for (const job of jobs) if (!latest.has(job.slug)) latest.set(job.slug, job);
  return [...latest.values()].filter((j) => j.outcome === 'failed' && !j.failure?.transient);
}

export const runningNow = (jobs: Job[]) => jobs.filter((j) => j.outcome === 'running');
