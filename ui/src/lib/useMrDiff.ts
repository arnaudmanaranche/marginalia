import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DiffFile, Pushes } from './api';
import { fetchJson } from './fetchRetry';
import { keys } from './queryKeys';

// Which code the pane shows: the MR as it is now or as an earlier review saw it (`version` is that
// review's history id), whole (`from` null) or only what changed after one of its pushes (`from`
// is that push's head commit).
export type DiffScope = { version: string | null; from: string | null };

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
export function useMrDiff(slug: string | null, stopId: string, refreshKey: string | undefined, scope: DiffScope = { version: null, from: null }): { state: DiffState; retry: () => void } {
  const query = useQuery({ ...diffQuery(slug ?? '', stopId, refreshKey, scope), enabled: slug !== null });
  return { state: diffStateOf(slug, query), retry: () => void query.refetch() };
}

function diffQuery(slug: string, stopId: string, refreshKey: string | undefined, scope: DiffScope) {
  return {
    queryKey: keys.diff(slug, stopId, scope.from, scope.version, refreshKey),
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const params = new URLSearchParams({ stop: stopId, ...(scope.version ? { version: scope.version } : scope.from ? { from: scope.from } : {}) });
      return fetchJson<DiffAnswer>(`/api/reviews/${encodeURIComponent(slug)}/diff?${params}`, { signal });
    },
  };
}

// Loads the diffs of the stops next to the one shown, so moving to them shows code at once.
export function usePrefetchMrDiffs(slug: string | null, stopIds: string[], refreshKey: string | undefined, scope: DiffScope) {
  const client = useQueryClient();
  const ids = stopIds.join('\n');
  useEffect(() => {
    if (!slug) return;
    // A diff already cached (the stop just left) is not fetched again: it changes with `refreshKey` only.
    for (const id of stopIds) void client.prefetchQuery({ ...diffQuery(slug, id, refreshKey, scope), staleTime: Infinity });
  }, [client, slug, ids, refreshKey, scope.from, scope.version]); // eslint-disable-line react-hooks/exhaustive-deps
}

// The MR's pushes, for the timeline over the diff. Null while loading or when GitLab cannot tell.
export function usePushes(slug: string | null, refreshKey: string | undefined): Pushes | null {
  const query = useQuery({
    queryKey: keys.pushes(slug ?? '', refreshKey),
    enabled: slug !== null,
    queryFn: ({ signal }) => fetchJson<Pushes>(`/api/reviews/${encodeURIComponent(slug!)}/pushes`, { signal }),
  });
  return slug && query.data ? query.data : null;
}
