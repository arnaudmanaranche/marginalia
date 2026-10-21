import { useQuery } from '@tanstack/react-query';
import { fetchThreads, type Thread } from './api';
import { keys } from './queryKeys';

const NONE: Thread[] = [];

// The MR's threads on lines of code, for the diff. Empty while loading or when they cannot be
// read: the diff is still worth showing without them. Read again when the review changes.
export function useThreads(slug: string | null, refreshKey: string | undefined): Thread[] {
  const query = useQuery({
    queryKey: keys.threads(slug ?? '', refreshKey),
    enabled: slug !== null,
    queryFn: () => fetchThreads(slug!),
  });
  return slug && query.data ? query.data : NONE;
}
