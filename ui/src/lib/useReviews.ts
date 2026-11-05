import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from './fetchRetry';
import { keys } from './queryKeys';
import type { ReviewContent, ReviewsPayload } from './api';

const POLL_MS = 30_000;
// Nothing loaded yet and the last try failed: look again soon, the regular poll is too slow for a first load.
const RETRY_FIRST_MS = 3000;

// How often the list is read again: a poll once it has loaded, a quicker try while it has not.
export function reviewsRefetchInterval(state: { data: unknown; status: string }) {
  if (state.data) return POLL_MS;
  return state.status === 'error' ? RETRY_FIRST_MS : false;
}

// The list of reviews with the bot's status. The "changed" stream (useLiveEvents) refreshes it, and a poll
// backs that up. Until the first answer arrives it keeps trying: a server that is slow or restarting must
// not leave the page empty.
export function useReviews() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: keys.reviews,
    queryFn: ({ signal }) => fetchJson<ReviewsPayload>('/api/reviews', { signal, retries: client.getQueryData(keys.reviews) ? 0 : 6 }),
    refetchInterval: (q) => reviewsRefetchInterval(q.state),
  });
  const reload = useCallback(() => void client.invalidateQueries({ queryKey: keys.reviews }), [client]);
  return {
    data: query.data ?? null,
    error: query.error ? String(query.error.message) : null,
    reload,
  };
}

// The content of one review. What is shown always belongs to `slug`: it is never the previous review's while
// the next loads. A new version of the same review (`refreshKey`) is fetched quietly, the old one stays meanwhile.
export function useReview(slug: string | null, refreshKey: string | undefined) {
  const query = useQuery({
    queryKey: keys.review(slug ?? '', refreshKey),
    enabled: slug !== null,
    queryFn: ({ signal }) => fetchJson<ReviewContent>(`/api/reviews/${encodeURIComponent(slug!)}`, { signal }),
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === slug ? previous : undefined),
  });
  const content = slug && query.data ? { markdown: query.data.markdown, shape: query.data.shape } : null;
  return { content, error: content ? null : query.error?.message ?? null, retry: () => void query.refetch() };
}
