import { money, kindLabel, shareOf, toneOf, type Budget } from '../lib/budget';
import { cn } from '../lib/utils';
import { LivePill } from './ds/LivePill';

const FILL = { ok: 'bg-ok', warn: 'bg-warn', fail: 'bg-fail' } as const;

// Today's budget (GLOSSARY: Budget), the way a usage meter shows a plan: what the day's Claude runs
// cost against the limit, filling calm, then amber near it, red once reached, when automatic work
// waits until midnight. Below, where the money went: by kind of run, and the MRs that cost the most.
export function BudgetMeter({ budget, className }: { budget: Budget; className?: string }) {
  const share = shareOf(budget);
  const tone = toneOf(budget);
  const top = budget.byMr.slice(0, 3);
  return (
    <section aria-label="Today's budget" className={cn('min-w-0', className)}>
      <div className="rounded-lg border border-line px-3 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-xs text-fg-muted">Spent today</p>
          {budget.over
            ? <LivePill tone="fail" label="Budget reached" />
            : <p className="text-xs tabular-nums text-fg-muted">{budget.leftUsd === null ? 'No daily limit' : `${money(budget.leftUsd)} left · resets at midnight`}</p>}
        </div>
        <p className="mt-0.5 text-lg font-semibold tabular-nums">
          {money(budget.spentUsd)}
          {budget.limitUsd !== null && <span className="text-sm font-normal text-fg-muted"> of {money(budget.limitUsd)}</span>}
          <span className="text-sm font-normal text-fg-muted"> · {budget.runs} run{budget.runs === 1 ? '' : 's'}</span>
        </p>
        {share !== null && (
          <div role="meter" aria-label="Share of today's budget spent" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className={cn('h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none', FILL[tone])} style={{ width: `${share * 100}%` }} />
          </div>
        )}
        {budget.over && (
          <p className="mt-2 text-xs text-fail">Automatic reviews and triages wait until midnight. A mention, or Run again (↻) on a review, still runs.</p>
        )}
        {(budget.byKind.length > 0 || top.length > 0) && (
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            {budget.byKind.length > 0 && (
              <div className="min-w-0">
                <dt className="sr-only">By kind of run</dt>
                <dd className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {budget.byKind.map((k) => <span key={k.kind} className="tabular-nums"><span className="text-fg-muted">{kindLabel(k.kind)}</span> {money(k.usd)}</span>)}
                </dd>
              </div>
            )}
            {top.length > 0 && (
              <div className="min-w-0">
                <dt className="sr-only">The MRs that cost the most</dt>
                <dd className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {top.map((mr) => (
                    <span key={`${mr.project}!${mr.iid}`} className="tabular-nums" title={`${mr.runs} run${mr.runs === 1 ? '' : 's'} on this MR today`}>
                      <span className="text-fg-muted">{mr.project} !{mr.iid}</span> {money(mr.usd)}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </section>
  );
}
