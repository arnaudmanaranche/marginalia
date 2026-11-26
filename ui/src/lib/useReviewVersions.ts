import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from './toast';
import { fetchHistory, fetchHistoryVersion, type ReviewVersion } from './api';
import { keys } from './queryKeys';
import { hrefOf, versionRoute } from './hashRoute';

const NONE: ReviewVersion[] = [];

// Earlier versions of a review, kept when a re-run replaces it. Viewing one is read-only;
// `versionId` is null while the latest is on screen. It lives in the URL (`?version=`): opening one is
// a step Back undoes, and a reload keeps it. A failed one is replaced by the latest, without a step.
export function useReviewVersions(slug: string | undefined, reviewedAt: string | undefined, versionId: string | null) {
  const setVersionId = (id: string | null) => { if (slug) location.hash = hrefOf(versionRoute(slug, id)); };
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
  // The latest earlier report, if any. Only whether one exists is read from it: the recap names its own baseline.
  const last = list.data?.[0] ?? null;
  useEffect(() => {
    if (!version.isError || version.isFetching) return;
    toast.error('Could not load that version', { description: version.error.message });
    if (slug) location.replace(hrefOf(versionRoute(slug, null)));
  }, [version.isError, version.isFetching, version.error, version.errorUpdatedAt]);
  return {
    versions: slug ? list.data ?? NONE : NONE,
    versionId,
    setVersionId,
    oldReview: versionId ? version.data ?? null : null,
    // Whether there is an earlier report: a re-review is likely, so the recap keeps its place while it loads.
    hasEarlier: Boolean(slug && last),
    // Whether the history is known: until then the reader waits, so the recap never pushes the tour down
    // once it is on screen.
    historyKnown: !slug || !list.isPending,
  };
}
