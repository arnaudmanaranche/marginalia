import { useQuery, type QueryKey } from '@tanstack/react-query';
import { fetchJson } from './fetchRetry';

// A GET read into the query cache. `known`: the first answer came, or could not (an error says nothing waits there).
export function useJson<T, R = T>(key: QueryKey, url: string, select?: (body: T) => R) {
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => fetchJson<T>(url, { signal }).then((body) => (select ? select(body) : (body as unknown as R))) });
  return { data: query.data ?? null, known: !query.isPending || query.isError, error: query.error ? String(query.error.message ?? query.error) : null, retry: () => void query.refetch() };
}
