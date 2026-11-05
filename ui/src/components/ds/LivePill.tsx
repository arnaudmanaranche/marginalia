import { cn } from '../../lib/utils';

export type LiveTone = 'run' | 'ok' | 'warn' | 'fail' | 'idle';

const DOT: Record<LiveTone, string> = { run: 'bg-run', ok: 'bg-ok', warn: 'bg-warn', fail: 'bg-fail', idle: 'bg-idle' };

// Where something stands right now, as a pill: a dot in the state's colour (it breathes while the
// thing is live), the word, and an optional measure (elapsed time, a count). The word carries the
// state; the dot backs it up.
export function LivePill({ tone, label, detail, live = false, title, className }: { tone: LiveTone; label: string; detail?: React.ReactNode; live?: boolean; title?: string; className?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-sunken px-2 py-0.5 text-xs ring-1 ring-inset ring-line', className)}>
      <span className="relative inline-flex size-1.5" aria-hidden>
        {live && <span className={cn('live-ping absolute inset-0 rounded-full', DOT[tone])} />}
        <span className={cn('relative size-1.5 rounded-full', DOT[tone])} />
      </span>
      <span className="font-medium">{label}</span>
      {detail != null && <span className="tabular-nums text-fg-muted">· {detail}</span>}
    </span>
  );
}
