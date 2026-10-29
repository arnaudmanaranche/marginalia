import { useEffect, useRef } from 'react';
import type { BotStatus, ReviewItem } from './api';
import { cuesBetween, snapshot, type Snapshot } from './soundCues';
import { play } from './sounds';

// Plays what changed in the list while the page is open: an MR arriving, a report ready, a run that
// failed, a reviewer writing on my MR.
export function useSoundCues(items: ReviewItem[] | undefined, status: BotStatus | null) {
  const last = useRef<Snapshot | null>(null);
  useEffect(() => {
    if (!items) return;
    const now = snapshot(items, status);
    for (const cue of cuesBetween(last.current, now)) play(cue);
    last.current = now;
  }, [items, status]);
}
