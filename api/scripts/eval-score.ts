// What `npm run eval` checks on one case, as named scorers so a run can be compared with another in
// PostHog Offline Evaluations (ADR 0014). Pure. `pass` is null when the scorer does not apply to the
// case (no planted problem, no rule to cite...). A case's expect.json says what applies:
//   planted      { path, lines: [from, to] } the problem the change plants, or null for a clean change
//   cites        strings a finding about the planted problem must name: the repo rule or ADR it breaks
//   maxSeverity  the worst severity the change deserves: anything above is generic noise
//   verification "reproduced" | "none", and evidence: "screenshot" (ADR 0009, 0010)

export interface Score { scorer: string; pass: boolean | null; why: string }

const ORDER = ['info', 'suggestion', 'important', 'critical'];
const serious = (f: any) => f.severity === 'critical' || f.severity === 'important';
const at = (planted: any) => (f: any) => {
  const [from, to] = planted.lines;
  return f.path === planted.path && f.line >= from - 2 && f.line <= to + 2;
};
const words = (f: any) => `${f.title ?? ''}\n${f.body ?? ''}\n${f.comment ?? ''}`.toLowerCase();
const listed = (findings: any[]) => findings.map((f) => `${f.severity} ${f.path ?? '-'}:${f.line ?? '-'} ${f.title}`).join('; ') || 'no finding';

export function scoreCase(expect: any, shape: any | null, runError: string | null = null): Score[] {
  if (!shape) return [{ scorer: 'contract_valid', pass: false, why: runError ?? 'the run gave no review' }];
  const findings: any[] = shape.findings ?? [];
  const tried = findings.filter((f) => ['reproduced', 'not_reproduced', 'inconclusive'].includes(f.verification?.status));
  const scores: Score[] = [{ scorer: 'contract_valid', pass: true, why: 'the review passed the contract' }];

  const near = expect.planted ? findings.filter(serious).filter(at(expect.planted)) : [];
  scores.push(expect.planted
    ? { scorer: 'found_planted', pass: near.length > 0, why: near.length ? `found as ${near.map((f) => f.id).join(', ')}` : `not found at ${expect.planted.path}:${expect.planted.lines.join('-')} (${listed(findings)})` }
    : { scorer: 'found_planted', pass: null, why: 'nothing planted' });

  const critical = findings.filter((f) => f.severity === 'critical');
  scores.push(expect.planted
    ? { scorer: 'no_critical_on_clean', pass: null, why: 'the change is not clean' }
    : { scorer: 'no_critical_on_clean', pass: !critical.length, why: critical.length ? `critical: ${listed(critical)}` : 'no critical finding' });

  // Relevant to this repo: the finding about the planted problem names the rule it breaks.
  const cites: string[] = (expect.cites ?? []).map((c: string) => c.toLowerCase());
  const citing = near.filter((f) => cites.some((c) => words(f).includes(c)));
  scores.push(cites.length
    ? { scorer: 'cites_repo_rule', pass: citing.length > 0, why: citing.length ? `${citing[0].id} names the rule` : `no finding at the planted place names ${expect.cites.join(' or ')}` }
    : { scorer: 'cites_repo_rule', pass: null, why: 'no rule to cite' });

  const above = expect.maxSeverity ? findings.filter((f) => ORDER.indexOf(f.severity) > ORDER.indexOf(expect.maxSeverity)) : [];
  scores.push(expect.maxSeverity
    ? { scorer: 'no_generic_noise', pass: !above.length, why: above.length ? `above ${expect.maxSeverity}: ${listed(above)}` : `nothing above ${expect.maxSeverity}` }
    : { scorer: 'no_generic_noise', pass: null, why: 'no severity ceiling' });

  if (!expect.verification) scores.push({ scorer: 'verification_ok', pass: null, why: 'no verification expected' });
  else {
    const problems: string[] = [];
    if (expect.verification === 'reproduced' && !tried.some((f) => f.verification.status === 'reproduced')) problems.push(`no finding was reproduced (${findings.map((f) => `${f.id}: ${f.proof}/${f.verification?.status ?? 'no verification'}`).join(', ') || 'no finding'})`);
    if (expect.evidence === 'screenshot' && !tried.some((f) => f.verification.status === 'reproduced' && f.verification.artifacts?.some((a: any) => a.kind === 'screenshot'))) problems.push('no reproduced finding carries a screenshot (is VERIFY_RUNNER_IMAGE the browser image?)');
    if (expect.verification === 'none' && tried.length) problems.push(`something was run for a pattern-only change: ${tried.map((f) => f.id).join(', ')}`);
    scores.push({ scorer: 'verification_ok', pass: !problems.length, why: problems.join('; ') || `verification ${expect.verification} as expected` });
  }
  return scores;
}
