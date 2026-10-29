import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from './toast';
import { fetchHistory, fetchHistoryVersion, type ReviewVersion } from './api';
import { keys } from './queryKeys';

const NONE: ReviewVersion[] = [];

// Earlier versions of a review, kept when a re-run replaces it. Viewing one is read-only;
// `versionId` is null while the latest is on screen.
export function useReviewVersions(slug: string | undefined, reviewedAt: string | undefined) {
  const [versionId, setVersionId] = useState<string | null>(null);
  // Another review, or a new version of this one: back to the latest.
  useEffect(() => setVersionId(null), [slug, reviewedAt]);
  const list = useQuery({
    queryKey: keys.historyList(slug ?? '', reviewedAt),
    enabled: Boolean(slug),
    queryFn: () => fetchHistory(slug!),
  });
  const version = useQuery({
    queryKey: keys.historyVersion(slug ?? '', versionId ?? ''),
    enabled: Boolean(slug && versionId),
    queryFn: () => fetchHistoryVersion(slug!, versionId!),
  });
  // The report the current one replaced, to say what changed since (cached with the versions read).
  const last = list.data?.[0] ?? null;
  const previous = useQuery({
    queryKey: keys.historyVersion(slug ?? '', last?.id ?? ''),
    enabled: Boolean(slug && last),
    queryFn: () => fetchHistoryVersion(slug!, last!.id),
  });
  useEffect(() => {
    if (!version.isError || version.isFetching) return;
    toast.error('Could not load that version', { description: version.error.message });
    setVersionId(null);
  }, [version.isError, version.isFetching, version.error, version.errorUpdatedAt]);
  return {
    versions: slug ? list.data ?? NONE : NONE,
    versionId,
    setVersionId,
    oldReview: versionId ? version.data ?? null : null,
    previous: slug && last && previous.data ? { id: last.id, at: last.at, review: previous.data } : null,
  };
}
