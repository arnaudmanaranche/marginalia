import { cn } from '../../lib/utils';

// Steps on a vertical rail: each item's mark sits on the rail, and the stretch of rail below it is
// solid once the item is done (the path walked) and dashed before (the path ahead).
export function Timeline({ children, label }: { children: React.ReactNode; label: string }) {
  return <ol aria-label={label} className="relative">{children}</ol>;
}

export function TimelineItem({ mark, walked, last = false, current = false, aside, children }: {
  mark: React.ReactNode; walked: boolean; last?: boolean; current?: boolean; aside?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <li aria-current={current ? 'step' : undefined} className="relative flex gap-3 pb-3 last:pb-0">
      {!last && (
        <span aria-hidden className={cn('absolute top-5 bottom-0 left-[7.5px] w-px', walked ? 'bg-ok/50' : 'border-l border-dashed border-idle/70 bg-transparent')} />
      )}
      <span className="relative z-10 mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-surface">{mark}</span>
      <div className="min-w-0 flex-1">{children}</div>
      {aside != null && <span className="mt-0.5 shrink-0 text-xs tabular-nums text-fg-muted">{aside}</span>}
    </li>
  );
}
