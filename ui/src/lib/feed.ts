import type { Job, ReviewItem } from './api';
import { groupOf, type GroupId } from './dashboard';

// What Home's feed lists (ADR 0007).

// The turns that wait on me, in the order they are worth doing: a first look, what came back, a review
// to send, then comments on my own MRs. Waiting on others, done and own reviews are not mine to act on.
const MINE: GroupId[] = ['first', 'returned', 'unsent', 'mine'];
const REASON: Partial<Record<GroupId, string>> = { first: 'First review', returned: 'Returned to you', unsent: 'Review to send', mine: 'Comments on your MR' };

export function reviewsNeedingYou(items: ReviewItem[]): { item: ReviewItem; reason: string }[] {
  const withGroup = items.map((item) => ({ item, group: groupOf(item) })).filter((x): x is { item: ReviewItem; group: GroupId } => x.group !== null && MINE.includes(x.group));
  return withGroup.sort((a, b) => MINE.indexOf(a.group) - MINE.indexOf(b.group)).map(({ item, group }) => ({ item, reason: REASON[group]! }));
}

// The jobs whose latest run failed for a reason that does not pass by itself: a person has to look.
// A run on an MR only while the bot still tracks it (`open`, every project's, from its status): once
// the MR is merged or closed, nothing is left to run again. Until the status is known, none is dropped.
export function failuresNeedingYou(jobs: Job[], open: ReadonlySet<string> | null = null): Job[] {
  const latest = new Map<string, Job>();
  for (const job of jobs) if (!latest.has(job.slug)) latest.set(job.slug, job);
  const stillOpen = (j: Job) => open === null || j.iid === null || j.what === 'understand' || open.has(j.slug);
  return [...latest.values()].filter((j) => j.outcome === 'failed' && !j.failure?.transient && stillOpen(j));
}

// What needs you, ranked by what matters rather than by kind: a review with critical findings, then
// one of high risk, then the turns in their usual order, the one waiting longest first. Each keeps
// its reason, so a mixed list still says why every row is there.
export function rankNeedingYou(rows: { item: ReviewItem; reason: string }[]): { item: ReviewItem; reason: string }[] {
  const weight = ({ item }: { item: ReviewItem }) => (item.critical > 0 ? 0 : item.risk === 'high' ? 1 : 2);
  const turn = (r: { item: ReviewItem }) => MINE.indexOf(groupOf(r.item) ?? 'first');
  return rows.toSorted((a, b) => weight(a) - weight(b) || turn(a) - turn(b) || a.item.reviewedAt.localeCompare(b.item.reviewedAt));
}

export const runningNow = (jobs: Job[]) => jobs.filter((j) => j.outcome === 'running');
