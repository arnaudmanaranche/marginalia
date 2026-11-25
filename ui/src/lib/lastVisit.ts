import { useEffect, useState } from 'react';
import { KEY_PREFIX, readStored, writeStored } from './storage';

const KEY = `${KEY_PREFIX}home-left`;

// When this browser last left Home (GLOSSARY: Since you last looked), read once as Home opens, so the
// briefing keeps its "since" while it is on screen. Leaving Home, hiding the tab or closing it moves
// the mark to now. Null on a first visit.
export function useLastVisit(): number | null {
  const [since] = useState(() => {
    const at = Number(readStored(KEY));
    return Number.isFinite(at) && at > 0 ? at : null;
  });
  useEffect(() => {
    const save = () => writeStored(KEY, String(Date.now()));
    const hidden = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', save);
      save();
    };
  }, []);
  return since;
}
