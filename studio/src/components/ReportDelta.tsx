import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Finding } from '../lib/api';
import { reportDelta } from '../lib/reportDelta';
import { cn, timeAgo } from '../lib/utils';
import { Badge } from './ui/Badge';
import type { BadgeTone } from './ui/badgeStyles';

const GROUPS: { key: 'added' | 'gone' | 'kept'; label: string; tone: BadgeTone }[] = [
  { key: 'added', label: 'new', tone: 'warning' },
  { key: 'gone', label: 'no longer raised', tone: 'success' },
  { key: 'kept', label: 'still there', tone: 'neutral' },
];

// What the bot says now compared with its report before this one: the findings it raises for the
// first time, the ones it dropped (most likely fixed by a push) and the ones still standing.
export function ReportDelta({ previous, at, current, onRead }: { previous: Finding[]; at: string; current: Finding[]; onRead: () => void }) {
  const [open, setOpen] = useState(false);
  const delta = reportDelta(previous, current);
  const any = previous.length + current.length > 0;
  return (
    <section aria-label="Since the previous report" className="mb-4 shrink-0 rounded-lg border border-zinc-200 text-xs dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <button aria-expanded={open} disabled={!any} onClick={() => setOpen(!open)} className="flex min-w-0 flex-wrap items-center gap-2 text-left disabled:cursor-default">
          <span className="text-fg-muted">Since the previous report ({timeAgo(at)})</span>
          {any
            ? GROUPS.map((g) => <Badge key={g.key} tone={delta[g.key].length ? g.tone : 'neutral'}>{delta[g.key].length} {g.label}</Badge>)
            : <span className="text-fg-muted">no finding then or now</span>}
          {any && <ChevronDown className={cn('size-3.5 shrink-0 text-fg-muted transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />}
        </button>
        <button onClick={onRead} className="shrink-0 text-fg-muted underline hover:text-zinc-900 dark:hover:text-zinc-100">Read it</button>
      </div>
      {open && (
        <div className="grid gap-3 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800 md:grid-cols-3">
          {GROUPS.map((g) => (
            <div key={g.key}>
              <h3 className="mb-1 font-medium capitalize">{g.label}</h3>
              {delta[g.key].length ? (
                <ul className="space-y-0.5">
                  {delta[g.key].map((f) => <li key={f.id} className="truncate" title={f.path ?? undefined}>{f.title}</li>)}
                </ul>
              ) : <p className="text-fg-muted">None</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
