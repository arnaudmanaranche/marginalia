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

// The share of the shorter title's words found in the other; 0 across files or without words.
export function overlap(a: Matchable, b: Matchable) {
  if (a.path !== b.path) return 0;
  const x = words(a.title);
  const y = words(b.title);
  const shorter = Math.min(x.size, y.size);
  return shorter > 0 ? [...x].filter((w) => y.has(w)).length / shorter : 0;
}

export function matchFindings<F extends Matchable>(previous: F[], current: F[]): Match<F> {
  const unmatched = new Set(previous);
  // The closest earlier finding still unmatched, when its overlap lies in [min, max).
  const closest = (f: F, min: number, max: number) => {
    let best: F | null = null;
    let score = 0;
    for (const p of unmatched) {
      const s = overlap(p, f);
      if (s >= min && s < max && s > score) { best = p; score = s; }
    }
    return best;
  };
  const kept: F[] = [];
  const reworded: { was: F; now: F }[] = [];
  const added: F[] = [];
  // Each pass settles what it can; a finding settled is out of the next pass.
  let rest = current;
  const pass = (settle: (f: F) => boolean) => { rest = rest.filter((f) => !settle(f)); };
  // A re-run is told to keep the id of a finding still there.
  pass((f) => {
    const was = [...unmatched].find((p) => p.id === f.id);
    if (!was) return false;
    unmatched.delete(was);
    kept.push(f);
    return true;
  });
  pass((f) => {
    const was = closest(f, SAME, Infinity);
    if (!was) return false;
    unmatched.delete(was);
    kept.push(f);
    return true;
  });
  for (const f of rest) {
    const was = closest(f, MAYBE_SAME, SAME);
    if (!was) { added.push(f); continue; }
    unmatched.delete(was);
    reworded.push({ was, now: f });
  }
  return { kept, added, gone: [...unmatched], reworded };
}
