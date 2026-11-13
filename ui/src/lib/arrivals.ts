import { useEffect, useRef, useState } from 'react';

// Each entry is a key and its signature: what, once different, means the thing changed in a way a
// person should see (a new report, a new verdict, queued or failed).
export type Entry = readonly [key: string, signature: string];

// The keys in `entries` that `known` has not seen, and those it saw with another signature. The first
// list (`known` null) is what was already there when the page opened: nothing in it counts.
export function changesSince(known: ReadonlyMap<string, string> | null, entries: readonly Entry[]): { arrived: string[]; changed: string[] } {
  if (!known) return { arrived: [], changed: [] };
  const arrived: string[] = [];
  const changed: string[] = [];
  for (const [key, sig] of entries) {
    if (!known.has(key)) arrived.push(key);
    else if (known.get(key) !== sig) changed.push(key);
  }
  return { arrived, changed };
}

// Reviews that came into the queue (a poll found a new MR) or changed (a new report, a new state)
// while the page is open, for a few seconds: long enough to show them arriving or changing.
export function useArrivals(entries: readonly Entry[] | null, holdMs = 6000): { arrived: (key: string) => boolean; changed: (key: string) => boolean } {
  const known = useRef<Map<string, string> | null>(null);
  const timers = useRef<number[]>([]);
  // Each mark's own turn: a timer clears a key only if no later change marked it again meanwhile.
  const turns = useRef(new Map<string, number>());
  const [fresh, setFresh] = useState<ReadonlyMap<string, 'arrived' | 'changed'>>(new Map());
  useEffect(() => {
    if (!entries) return;
    const { arrived, changed } = changesSince(known.current, entries);
    known.current = new Map([...(known.current ?? []), ...entries]);
    const marked = [...arrived, ...changed];
    if (!marked.length) return;
    setFresh((prev) => new Map([...prev, ...arrived.map((k) => [k, 'arrived'] as const), ...changed.map((k) => [k, 'changed'] as const)]));
    const mine = new Map(marked.map((k) => [k, (turns.current.get(k) ?? 0) + 1]));
    for (const [k, turn] of mine) turns.current.set(k, turn);
    timers.current.push(window.setTimeout(() => setFresh((prev) => new Map([...prev].filter(([k]) => !mine.has(k) || turns.current.get(k) !== mine.get(k)))), holdMs));
  }, [entries, holdMs]);
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);
  return { arrived: (key) => fresh.get(key) === 'arrived', changed: (key) => fresh.get(key) === 'changed' };
}
