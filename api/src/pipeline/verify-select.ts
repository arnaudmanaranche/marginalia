// Which findings of a chapter are worth reproducing (ADR 0009, 0010): a claim about behaviour that blocks
// the merge, most severe first, within what is left of the review's few verifications, never one another
// chapter already took, and one copy of a finding repeated in the chapter. Everything else is never run. Pure.

const ORDER = ['critical', 'important'];

// Positions in `findings`: the ones to verify, in the order to try them, and the ones that would have been
// but for the budget (`over`). A finding that is not a candidate at all is in neither list.
export function selectForVerify(findings: any[], left: number, taken: (f: any) => boolean = () => false, key?: (f: any) => string) {
  const wanted = findings.map((f, i) => ({ f, i })).filter(({ f }) => f.proof === 'runtime' && ORDER.includes(f.severity) && !f.verification && !taken(f));
  wanted.sort((a, b) => ORDER.indexOf(a.f.severity) - ORDER.indexOf(b.f.severity));
  const seen = new Set<string>();
  const unique = key ? wanted.filter(({ f }) => { const k = key(f); if (seen.has(k)) return false; seen.add(k); return true; }) : wanted;
  const room = Math.max(0, left);
  return { picked: unique.slice(0, room).map(({ i }) => i), over: unique.slice(room).map(({ i }) => i) };
}

export const OVER_LIMIT = 'over the limit of verifications for one review';
