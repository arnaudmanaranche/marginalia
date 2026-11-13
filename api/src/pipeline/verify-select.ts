// Which findings of a chapter are worth reproducing (ADR 0009, 0010): a claim about behaviour that blocks
// the merge, most severe first, within what is left of the review's few verifications, and never one
// another chapter already took. Everything else is never run. Pure.

const ORDER = ['critical', 'important'];

// Positions in `findings`: the ones to verify, in the order to try them, and why each other one is not.
export function selectForVerify(findings: any[], left: number, taken: (f: any) => boolean = () => false) {
  const wanted = findings.map((f, i) => ({ f, i })).filter(({ f }) => f.proof === 'runtime' && ORDER.includes(f.severity) && !f.verification && !taken(f));
  wanted.sort((a, b) => ORDER.indexOf(a.f.severity) - ORDER.indexOf(b.f.severity));
  const room = Math.max(0, left);
  return { picked: wanted.slice(0, room).map(({ i }) => i), over: wanted.slice(room).map(({ i }) => i) };
}

export const OVER_LIMIT = 'over the limit of verifications for one review';
