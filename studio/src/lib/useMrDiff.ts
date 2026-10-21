import { useQuery } from '@tanstack/react-query';
import type { DiffFile } from './api';
import { fetchJson } from './fetchRetry';
import { keys } from './queryKeys';

// Which code the pane shows: the MR as it is now or as an earlier review saw it (`version` is that
// review's history id), whole ('full') or only what changed since that review ('since').
export type DiffScope = { version: string | null; mode: 'full' | 'since' };

export type DiffState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; files: DiffFile[]; approximate: boolean };

interface DiffAnswer {
  files: DiffFile[];
  approximate?: boolean;
}

// What the pane shows for a query's standing. A failed query that is being tried again counts as loading.
export function diffStateOf(slug: string | null, q: { data?: DiffAnswer; error: Error | null; isFetching: boolean }): DiffState {
  if (!slug) return { status: 'idle' };
  if (q.data) return { status: 'ready', files: q.data.files, approximate: Boolean(q.data.approximate) };
  if (q.error && !q.isFetching) return { status: 'error', message: q.error.message };
  return { status: 'loading' };
}

// The changed files of the MR behind a review, those of one tour stop. Idle without a slug (a
// review with no tracked MR); refetched when the stop or the review changes, and tried
// again by itself when the server is slow or restarting. What was loaded for another stop never shows
// under this one: it counts as loading at once.
export function useMrDiff(slug: string | null, stopId: string, refreshKey: string | undefined, scope: DiffScope = { version: null, mode: 'full' }): { state: DiffState; retry: () => void } {
  const query = useQuery({
    queryKey: keys.diff(slug ?? '', stopId, scope.mode, scope.version, refreshKey),
    enabled: slug !== null,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ stop: stopId, mode: scope.mode, ...(scope.version && { version: scope.version }) });
      return fetchJson<DiffAnswer>(`/api/reviews/${encodeURIComponent(slug!)}/diff?${params}`, { signal });
    },
  });
  return { state: diffStateOf(slug, query), retry: () => void query.refetch() };
}
