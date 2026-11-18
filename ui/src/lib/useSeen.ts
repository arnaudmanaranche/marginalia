import { useCallback, useEffect, useState } from 'react';
import type { ReviewItem } from './api';
import { KEY_PREFIX, readJson, writeJson } from './storage';

const KEY = `${KEY_PREFIX}seen`;

// Which reviews were read, at which version. Opening a review marks it as read; saved here,
// not inside a state updater.
export function useSeen(current: ReviewItem | undefined) {
  const [seen, setSeen] = useState(() => readJson<Record<string, string>>(KEY, {}));
  useEffect(() => {
    if (!current || seen[current.slug] === current.reviewedAt) return;
    const next = { ...seen, [current.slug]: current.reviewedAt };
    writeJson(KEY, next);
    setSeen(next);
  }, [current, seen]);
  const isUnread = useCallback((i: ReviewItem) => seen[i.slug] !== i.reviewedAt, [seen]);
  return { isUnread };
}
