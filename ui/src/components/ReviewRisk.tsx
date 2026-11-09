import { ChevronRight } from 'lucide-react';
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
// then what would lower it. One line until opened, so the chapters keep the room; quiet when there is nothing to weigh (low risk, or a review made
// before the axes existed).
export function ReviewRisk({ risk }: { risk: Risk | null }) {
  if (!risk?.axes?.length || risk.level === 'low') return null;
  const level = (l: RiskLevel) => <Badge tone={TONE[l]}>{l}</Badge>;
  const weak = risk.axes.filter((a) => a.level !== 'low');
  return (
    <details aria-label="Why this risk" className="group mb-4 shrink-0 rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-xs text-fg-muted [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
        <span className="font-medium">Why {risk.level} risk</span>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {weak.map((a) => <span key={a.axis} className="inline-flex items-center gap-1">{level(a.level)}<span className="truncate">{QUESTION[a.axis]}</span></span>)}
        </span>
      </summary>
      <div className="max-h-[40vh] overflow-y-auto border-t border-line px-4 pb-4 pt-3">
        <dl className="grid gap-x-3 gap-y-2 text-sm md:grid-cols-[auto_auto_1fr] md:items-baseline">
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
      </div>
    </details>
  );
}
