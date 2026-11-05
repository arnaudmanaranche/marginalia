import { useQuery } from '@tanstack/react-query';
import type { Job } from './api';
import { fetchJson } from './fetchRetry';
import { keys } from './queryKeys';

// The latest jobs of every line, newest first; kept current by the live events. Null while loading.
export function useJobs(): { jobs: Job[] | null; error: string | null; retry: () => void } {
  const query = useQuery({
    queryKey: keys.jobs,
    queryFn: ({ signal }) => fetchJson<{ jobs: Job[] }>('/api/jobs?limit=100', { signal }).then((r) => r.jobs),
  });
  return { jobs: query.data ?? null, error: query.error ? String(query.error.message ?? query.error) : null, retry: () => void query.refetch() };
}
