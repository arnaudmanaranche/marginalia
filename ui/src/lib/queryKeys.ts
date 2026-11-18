import { partialMatchKey, type QueryKey } from '@tanstack/react-query';

// A key starts with what it holds, then the review it is about: invalidating a root reaches every query of
// it, a root and a slug those of one review.
const root = { review: ['review'], history: ['history'], runs: ['runs'] } as const;

export const keys = {
  reviews: ['reviews'] as const,
  reviewsOf: (slug: string) => [...root.review, slug] as const,
  review: (slug: string, refreshKey?: string) => [...root.review, slug, refreshKey ?? null] as const,
  drafts: (slug: string) => ['drafts', slug] as const,
  historyList: (slug: string, refreshKey?: string) => [...root.history, slug, 'list', refreshKey ?? null] as const,
  historyVersion: (slug: string, id: string) => [...root.history, slug, 'version', id] as const,
  threads: (slug: string, refreshKey?: string, scope: 'lines' | 'all' = 'lines') => ['threads', slug, scope, refreshKey ?? null] as const,
  diff: (slug: string, stop: string, from: string | null, version: string | null, refreshKey?: string) => ['diff', slug, stop, from, version, refreshKey ?? null] as const,
  pushes: (slug: string, refreshKey?: string) => ['pushes', slug, refreshKey ?? null] as const,
  runs: (slug: string) => [...root.runs, slug, 'list'] as const,
  run: (slug: string, id: string) => [...root.runs, slug, 'run', id] as const,
  // Under 'runs', so the live invalidation keeps these current with the jobs.
  jobs: [...root.runs, '*', 'jobs'] as const,
  queue: [...root.runs, '*', 'queue'] as const,
  contexts: [...root.runs, '*', 'contexts'] as const,
  context: (key: string) => [...root.runs, '*', 'context', key] as const,
  approvals: ['approvals'] as const,
  me: ['me'] as const,
};

// Whether a cached query is one of `prefix`, e.g. a review's own content against `keys.reviewsOf(slug)`.
export const isUnder = (queryKey: QueryKey, prefix: QueryKey) => partialMatchKey(queryKey, prefix);

// What the bot's "changed" event makes stale. The list, the reports and the runs are cheap local reads. The
// threads and the diff come from GitLab and are keyed by the review's own version, so a new report
// refetches them by itself; they are not reloaded on every file change.
// The approvals inbox changes with every review and every post.
export const LIVE_KEYS = [keys.reviews, root.review, root.history, root.runs, keys.approvals] as const;
