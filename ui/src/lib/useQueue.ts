import { useQuery } from '@tanstack/react-query';
import { fetchJson } from './fetchRetry';
import type { QueueView } from './queue';

// Under 'runs', so the live events keep it current with the jobs.
export const QUEUE_KEY = ['runs', '*', 'queue'] as const;

// The bot's queue; kept current by the live events. Null while loading.
export function useQueue(): { queue: QueueView | null; error: string | null; retry: () => void } {
  const query = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: ({ signal }) => fetchJson<QueueView>('/api/queue?limit=100', { signal }),
  });
  return { queue: query.data ?? null, error: query.error ? String(query.error.message ?? query.error) : null, retry: () => void query.refetch() };
}
