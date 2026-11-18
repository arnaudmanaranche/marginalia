import { useCallback, useEffect, useRef, useState } from 'react';
import { KEY_PREFIX, readJson, writeJson } from './storage';

// State mirrored in localStorage (JSON).
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readJson(key, initial));
  // Written after the state changes, not inside the updater (which React may run twice);
  // the first render only read it, so nothing is written until the value is set.
  const loaded = useRef(true);
  useEffect(() => {
    if (loaded.current) {
      loaded.current = false;
      return;
    }
    writeJson(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}

// The "working set": reviews opened as tabs. Opening one adds it; tabs for reviews that no longer exist are dropped.
export function useOpenTabs(slug: string | null, known: Set<string> | null) {
  const [tabs, setTabs] = usePersistentState<string[]>(`${KEY_PREFIX}tabs`, []);

  useEffect(() => {
    if (slug && known?.has(slug)) setTabs((p) => (p.includes(slug) ? p : [...p, slug]));
  }, [slug, known, setTabs]);

  useEffect(() => {
    // An empty list is treated as a transient glitch (e.g. a directory read
    // failing), never as "every review is gone".
    if (!known || known.size === 0) return;
    setTabs((p) => {
      const kept = p.filter((s) => known.has(s));
      return kept.length === p.length ? p : kept;
    });
  }, [known, setTabs]);

  // Returns the tab to show next (the neighbour of the closed one), or null for Home.
  const close = useCallback(
    (s: string) => {
      const i = tabs.indexOf(s);
      const rest = tabs.filter((x) => x !== s);
      setTabs(rest);
      return rest[Math.min(i, rest.length - 1)] ?? null;
    },
    [tabs, setTabs],
  );

  return { tabs, close };
}
