import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { money, kindLabel, shareOf, toneOf, type Budget } from '../lib/budget';
import { unfold } from '../lib/motion';
import { cn } from '../lib/utils';

const FILL = { ok: 'bg-ok', warn: 'bg-warn', fail: 'bg-fail' } as const;

// Today's budget (GLOSSARY: Budget) in one line, the way a usage meter sits in a tool's status bar:
// what the day's Claude runs cost against the limit, filling calm, then amber near it, red once
// reached. Where the money went (by kind of run, the MRs that cost the most) opens under it. Once the
// budget is reached, what that stops is said at once, never folded.
export function BudgetMeter({ budget, className }: { budget: Budget; className?: string }) {
  const [open, setOpen] = useState(false);
  const share = shareOf(budget);
  const tone = toneOf(budget);
  const top = budget.byMr.slice(0, 3);
  const more = budget.byKind.length > 0 || top.length > 0;
  return (
    <section aria-label="Today's budget" className={cn('min-w-0', className)}>
      <button type="button" disabled={!more} onClick={() => setOpen(!open)} aria-expanded={more ? open : undefined}
        className="touch-target group flex w-full min-w-0 items-center gap-3 rounded-md text-left enabled:cursor-pointer">
        <span className="min-w-0">
          <span className="block text-xs text-fg-muted">Spent today</span>
          <span className="block text-sm font-semibold whitespace-nowrap tabular-nums">
            {money(budget.spentUsd)}
            {budget.limitUsd !== null && <span className="font-normal text-fg-muted"> of {money(budget.limitUsd)}</span>}
          </span>
        </span>
        {share !== null && (
          <span role="meter" aria-label="Share of today's budget spent" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}
            className="h-1.5 w-full min-w-16 flex-1 overflow-hidden rounded-full bg-sunken">
            <span className={cn('block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none', FILL[tone])} style={{ width: `${share * 100}%` }} />
          </span>
        )}
        <span className="shrink-0 text-xs whitespace-nowrap text-fg-muted tabular-nums">
          {budget.over ? <span className="font-medium text-fail">Reached</span> : budget.leftUsd === null ? 'No daily limit' : `${money(budget.leftUsd)} left`}
        </span>
        {more && <ChevronDown className={cn('size-3.5 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:text-fg motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />}
      </button>
      {budget.over && <p className="mt-1.5 text-xs text-fail">Automatic reviews and triages wait until midnight. A mention, or Run again (↻) on a review, still runs.</p>}
      <AnimatePresence initial={false}>
        {open && (
          <m.div {...unfold} className="overflow-hidden">
            <dl className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs">
              <dt className="sr-only">Runs today</dt>
              <dd className="tabular-nums text-fg-muted">{budget.runs} run{budget.runs === 1 ? '' : 's'} · resets at midnight</dd>
              <dt className="sr-only">By kind of run</dt>
              {budget.byKind.map((k) => <dd key={k.kind} className="tabular-nums"><span className="text-fg-muted">{kindLabel(k.kind)}</span> {money(k.usd)}</dd>)}
              <dt className="sr-only">The MRs that cost the most</dt>
              {top.map((mr) => (
                <dd key={`${mr.project}!${mr.iid}`} className="tabular-nums" title={`${mr.runs} run${mr.runs === 1 ? '' : 's'} on this MR today`}>
                  <span className="font-mono text-[11px] text-fg-muted">{mr.project} !{mr.iid}</span> {money(mr.usd)}
                </dd>
              ))}
            </dl>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  );
}
