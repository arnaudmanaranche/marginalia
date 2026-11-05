import { useQuery } from '@tanstack/react-query';
import type { RunSummary, RunTrace } from './api';
import { fetchJson } from './fetchRetry';
import { keys } from './queryKeys';

// The bot's runs on one review, newest first. Read again on every "changed" from the bot, so the
// one in progress moves on by itself.
export function useRuns(slug: string | null): RunSummary[] | null {
  const query = useQuery({
    queryKey: keys.runs(slug ?? ''),
    enabled: slug !== null,
    queryFn: ({ signal }) => fetchJson<{ runs: RunSummary[] }>(`/api/reviews/${encodeURIComponent(slug!)}/runs`, { signal }).then((r) => r.runs),
  });
  return slug && query.data ? query.data : null;
}

// One run with every step it took. Null while loading.
export function useRun(slug: string | null, id: string | null): RunTrace | null {
  const query = useQuery({
    queryKey: keys.run(slug ?? '', id ?? ''),
    enabled: slug !== null && id !== null,
    queryFn: ({ signal }) => fetchJson<RunTrace>(`/api/reviews/${encodeURIComponent(slug!)}/runs/${encodeURIComponent(id!)}`, { signal }),
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[3] === id ? previous : undefined),
  });
  return slug && id && query.data ? query.data : null;
}
