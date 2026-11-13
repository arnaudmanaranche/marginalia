import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from './toast';
import { fetchHistory, fetchHistoryVersion, type ReviewVersion } from './api';
import { keys } from './queryKeys';
import { versionRoute } from './hashRoute';

const NONE: ReviewVersion[] = [];

// Earlier versions of a review, kept when a re-run replaces it. Viewing one is read-only;
// `versionId` is null while the latest is on screen. It lives in the URL (`?version=`): opening one is
// a step Back undoes, and a reload keeps it. A failed one is replaced by the latest, without a step.
export function useReviewVersions(slug: string | undefined, reviewedAt: string | undefined, versionId: string | null) {
  const setVersionId = (id: string | null) => { if (slug) location.hash = `#/${versionRoute(slug, id)}`; };
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
    if (slug) location.replace(`#/${versionRoute(slug, null)}`);
  }, [version.isError, version.isFetching, version.error, version.errorUpdatedAt]);
  return {
    versions: slug ? list.data ?? NONE : NONE,
    versionId,
    setVersionId,
    oldReview: versionId ? version.data ?? null : null,
    previous: slug && last && previous.data ? { id: last.id, at: last.at, review: previous.data } : null,
    // Whether there is a previous report is known: until then the reader waits, so the line saying what
    // changed since never pushes the tour down once it is on screen.
    historyKnown: !slug || !list.isPending,
    // There is a previous report and it is on its way: its line can keep its place.
    previousLoading: Boolean(slug && last && !previous.data && previous.isFetching),
  };
}
