import type { Risk, RiskLevel } from '../lib/api';
import { Badge } from './ui/Badge';

const TONE = { low: 'success', medium: 'warning', high: 'danger' } as const;
const QUESTION = {
  verification: 'Is it proven to work?',
  alignment: 'Does it do only what was asked?',
  impact: 'How far can it reach?',
  rollback: 'Can it be undone?',
  detection: 'Would a failure be seen?',
} as const;

// Why the risk is what it is: the five questions, each answered low, medium or high with a note,
// then what would lower it. Quiet when there is nothing to weigh (low risk, or a review made
// before the axes existed).
export function ReviewRisk({ risk }: { risk: Risk | null }) {
  if (!risk?.axes?.length || risk.level === 'low') return null;
  const level = (l: RiskLevel) => <Badge tone={TONE[l]}>{l}</Badge>;
  return (
    <section aria-label="Why this risk" className="mb-4 shrink-0 rounded-xl border border-line bg-surface p-4">
      <h2 className="text-xs font-medium text-fg-muted">Why {risk.level} risk</h2>
      <dl className="mt-2 grid gap-x-3 gap-y-2 text-sm md:grid-cols-[auto_auto_1fr] md:items-baseline">
        {risk.axes.map((a) => (
          <div key={a.axis} className="contents">
            <dt className="font-medium">{QUESTION[a.axis]}</dt>
            <dd className="md:contents"><span>{level(a.level)}</span><span className="block text-fg-muted md:inline">{a.note}</span></dd>
          </div>
        ))}
      </dl>
      {!!risk.mitigations?.length && (
        <div className="mt-3 border-t border-line pt-3">
          <h3 className="text-xs font-medium text-fg-muted">To lower it</h3>
          <ul className="mt-1.5 list-disc pl-5 text-sm">{risk.mitigations.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
