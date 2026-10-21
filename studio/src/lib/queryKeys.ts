// One place for the query keys, so the data hooks and the invalidation on "changed" agree.
// A key starts with what it holds, then the review it is about: invalidating ['history'] reaches every
// history query, ['history', slug] those of one review.
export const keys = {
  reviews: ['reviews'] as const,
  review: (slug: string, refreshKey?: string) => ['review', slug, refreshKey ?? null] as const,
  drafts: (slug: string) => ['drafts', slug] as const,
  historyList: (slug: string, refreshKey?: string) => ['history', slug, 'list', refreshKey ?? null] as const,
  historyVersion: (slug: string, id: string) => ['history', slug, 'version', id] as const,
  threads: (slug: string, refreshKey?: string) => ['threads', slug, refreshKey ?? null] as const,
  diff: (slug: string, stop: string, mode: string, version: string | null, refreshKey?: string) => ['diff', slug, stop, mode, version, refreshKey ?? null] as const,
};

// What the bot's "changed" event makes stale. The list and the reports are cheap local reads. The
// threads and the diff come from GitLab and are keyed by the review's own version, so a new report
// refetches them by itself; they are not reloaded on every file change.
export const LIVE_KEYS = [keys.reviews, ['review'], ['history']] as const;
