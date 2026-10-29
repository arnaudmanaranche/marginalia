import { useQuery } from '@tanstack/react-query';
import { fetchThreads, type Thread } from './api';
import { keys } from './queryKeys';

const NONE: Thread[] = [];

// The MR's threads on lines of code, for the diff, or with scope 'all' every thread (the ones I
// answer on my own MR). Empty while loading or when they cannot be read: the page is still worth
// showing without them. Read again when the review changes.
export function useThreads(slug: string | null, refreshKey: string | undefined, scope: 'lines' | 'all' = 'lines'): Thread[] {
  const query = useQuery({
    queryKey: keys.threads(slug ?? '', refreshKey, scope),
    enabled: slug !== null,
    queryFn: () => fetchThreads(slug!, scope),
  });
  return slug && query.data ? query.data : NONE;
}
