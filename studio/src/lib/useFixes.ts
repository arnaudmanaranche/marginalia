import { useEffect, useEffectEvent, useState } from 'react';
import { fetchFixes, type FixesStatus } from './api';

// Where a triage's local fixes stand against the MR branch on origin, read again when the triage
// changes or on `check()`. Shared by the fixes card (to push) and the replies (a "fixed" reply
// waits for its fix to be pushed, and names the commit). `slug` null: nothing to check.
export function useFixes(slug: string | null, refreshKey: string | undefined) {
  const [fixes, setFixes] = useState<FixesStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    if (!slug) return;
    setChecking(true);
    try {
      setFixes(await fetchFixes(slug));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };
  const onRefresh = useEffectEvent(check);
  useEffect(() => {
    setFixes(null);
    onRefresh();
  }, [slug, refreshKey]);

  return { fixes, setFixes, error, checking, check };
}

export type FixesState = ReturnType<typeof useFixes>;
