import { useEffect, useRef, useState } from 'react';

// The slugs in `slugs` that `known` has not seen. The first list (`known` null) is what was already
// there when the page opened: nothing in it counts as arrived.
export function newArrivals(known: Set<string> | null, slugs: string[]): string[] {
  return known ? slugs.filter((s) => !known.has(s)) : [];
}

// Reviews that came into the queue while the page is open (a poll found a new MR), for a few
// seconds: long enough to show them arriving.
export function useArrivals(slugs: string[] | null, holdMs = 6000): (slug: string) => boolean {
  const known = useRef<Set<string> | null>(null);
  const timers = useRef<number[]>([]);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!slugs) return;
    const arrived = newArrivals(known.current, slugs);
    known.current = new Set([...(known.current ?? []), ...slugs]);
    if (!arrived.length) return;
    setFresh((prev) => new Set([...prev, ...arrived]));
    timers.current.push(window.setTimeout(() => setFresh((prev) => new Set([...prev].filter((s) => !arrived.includes(s)))), holdMs));
  }, [slugs, holdMs]);
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);
  return (slug) => fresh.has(slug);
}
