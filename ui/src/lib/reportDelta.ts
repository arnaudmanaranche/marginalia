import type { Finding } from './api';

export interface ReportDelta {
  added: Finding[];
  kept: Finding[];
  gone: Finding[];
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);

// The same issue reworded: same file, and most words of the shorter title in the other.
function sameIssue(a: Finding, b: Finding) {
  if (a.path !== b.path) return false;
  const x = words(a.title);
  const y = words(b.title);
  const shorter = Math.min(x.size, y.size);
  return shorter > 0 && [...x].filter((w) => y.has(w)).length / shorter >= 0.5;
}

// What the current report says compared with the one before it. A re-run is told to keep the id of
// a finding still there; a finding written before that, or given a new id anyway, is matched by
// file and title. `gone` is what the bot no longer raises, most likely fixed.
export function reportDelta(previous: Finding[], current: Finding[]): ReportDelta {
  const unmatched = new Set(previous);
  const kept: Finding[] = [];
  const added: Finding[] = [];
  const take = (f: Finding, test: (p: Finding) => boolean) => {
    const match = [...unmatched].find(test);
    if (!match) return false;
    unmatched.delete(match);
    kept.push(f);
    return true;
  };
  const rest = current.filter((f) => !take(f, (p) => p.id === f.id));
  for (const f of rest) if (!take(f, (p) => sameIssue(p, f))) added.push(f);
  return { added, kept, gone: [...unmatched] };
}
