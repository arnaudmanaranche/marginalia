import type { ReproductionStatus, Verification } from '../lib/api';
import { Badge } from './ui/Badge';
import { ProofArtifacts } from './ProofArtifacts';

const STATUS = {
  reproduced: { label: 'Reproduced', tone: 'danger', hint: 'Running the project showed it.' },
  not_reproduced: { label: 'Not reproduced', tone: 'warning', hint: 'A fair attempt did not show it. The finding stays: you decide.' },
  inconclusive: { label: 'Could not be reproduced here', tone: 'neutral', hint: 'It could not be run, so it proves nothing either way.' },
  skipped: { label: 'Not run', tone: 'neutral', hint: '' },
} as const satisfies Record<ReproductionStatus, { label: string; tone: 'danger' | 'warning' | 'neutral'; hint: string }>;

// What running the project found about a finding (ADR 0009): the outcome in words and colour, then
// what was run and what came out. A finding that was not run says why, quietly.
export function FindingProof({ verification }: { verification?: Verification }) {
  if (!verification) return null;
  const { label, tone, hint } = STATUS[verification.status];
  if (verification.status === 'skipped') return <p className="mt-2 text-xs text-fg-muted">{label}: {verification.evidence}</p>;
  return (
    <div className="mt-2 rounded-md border border-line bg-sunken px-3 py-2 text-xs">
      <p className="flex flex-wrap items-center gap-2"><Badge tone={tone}>{label}</Badge><span className="text-fg-muted">{hint}</span></p>
      {verification.evidence && <p className="mt-1.5 leading-relaxed [overflow-wrap:anywhere]">{verification.evidence}</p>}
      <ProofArtifacts artifacts={verification.artifacts} />
      {verification.command && <p className="mt-1.5 text-fg-muted">Command: <code className="font-mono [overflow-wrap:anywhere]">{verification.command}</code></p>}
    </div>
  );
}
