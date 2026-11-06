// Which findings of a review are worth reproducing (ADR 0009): a claim about behaviour that blocks
// the merge, most severe first, a few at most so a review's cost stays bounded. Everything else is
// never run. Pure.

const ORDER = ['critical', 'important'];

// The ids to verify, in the order to try them.
export function selectForVerify(findings: any[], max: number) {
  return findings
    .filter((f) => f.proof === 'runtime' && ORDER.includes(f.severity) && !f.verification)
    .sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity))
    .slice(0, Math.max(0, max))
    .map((f) => f.id);
}

// Why a finding is not verified, for the report: the reason is what a person reads.
export function skipReason(finding: any, selected: string[]) {
  if (finding.proof !== 'runtime') return 'a pattern or a rule, running the project proves nothing about it';
  if (!ORDER.includes(finding.severity)) return 'it does not block the merge';
  return selected.includes(finding.id) ? null : 'over the limit of verifications for one review';
}
