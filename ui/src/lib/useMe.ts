import { useQuery } from '@tanstack/react-query';
import { fetchJson } from './fetchRetry';
import { keys } from './queryKeys';
import { meOf, type Me } from './session';

// The signed-in person of a hosted studio, null locally. Read once: a session that ends shows up as a 401
// on the next request, which sends the page to the login (loginRedirect.ts).
export function useMe(): Me | null {
  const { data } = useQuery({ queryKey: keys.me, queryFn: ({ signal }) => fetchJson<unknown>('/api/me', { signal, retries: 1 }).then(meOf), staleTime: Infinity });
  return data ?? null;
}
