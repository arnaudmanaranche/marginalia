// What a re-run says compared with the report before it, finding by finding. Pure.
//
// A finding is the same when it keeps its id, or when it sits in the same file and most words of
// the shorter title are in the other. A weaker overlap is only a guess: it is reported as a pair
// ("reworded?") for a person to judge, never silently counted as one finding gone and one new.

export interface Matchable {
  id: string;
  path: string | null;
  title: string;
}

export interface Match<F extends Matchable> {
  kept: F[];
  added: F[];
  gone: F[];
  reworded: { was: F; now: F }[];
}

export const SAME = 0.5;
export const MAYBE_SAME = 0.3;

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);

// The share of the shorter title's words found in the other; 0 across files, without a file (no
// file, no identity to compare on) or without words.
export function overlap(a: Matchable, b: Matchable) {
  if (a.path === null || a.path !== b.path) return 0;
  const x = words(a.title);
  const y = words(b.title);
  const shorter = Math.min(x.size, y.size);
  return shorter > 0 ? [...x].filter((w) => y.has(w)).length / shorter : 0;
}

export function matchFindings<F extends Matchable>(previous: F[], current: F[]): Match<F> {
  const free = new Set(previous);
  const kept: F[] = [];
  const reworded: { was: F; now: F }[] = [];
  let rest = current;
  // Pairs the closest first, so a finding never takes an earlier one a closer finding wants.
  const settle = (min: number, max: number, done: (was: F, now: F) => void) => {
    const pairs = rest.flatMap((now) => [...free].map((was) => ({ was, now, score: overlap(was, now) })))
      .filter((p) => p.score >= min && p.score < max)
      .sort((a, b) => b.score - a.score);
    const taken = new Set<F>();
    for (const { was, now } of pairs) {
      if (!free.has(was) || taken.has(now)) continue;
      free.delete(was);
      taken.add(now);
      done(was, now);
    }
    rest = rest.filter((f) => !taken.has(f));
  };
  // A re-run is told to keep the id of a finding still there.
  for (const now of [...rest]) {
    const was = [...free].find((p) => p.id === now.id);
    if (!was) continue;
    free.delete(was);
    kept.push(now);
    rest = rest.filter((f) => f !== now);
  }
  settle(SAME, Infinity, (_, now) => kept.push(now));
  settle(MAYBE_SAME, SAME, (was, now) => reworded.push({ was, now }));
  return { kept, added: rest, gone: [...free], reworded };
}
