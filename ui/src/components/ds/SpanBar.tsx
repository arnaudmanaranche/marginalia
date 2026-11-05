import type { Span } from '../../lib/trace';
import { cn } from '../../lib/utils';

const FILL: Record<Span['state'], string> = { done: 'bg-ok/80', running: 'bg-run', failed: 'bg-fail', skipped: 'bg-idle/50', pending: 'bg-idle/30' };

// Spans on one track, each placed at its share of the total time and coloured by its state: a
// whole run's stages in one bar, or one stage alone on a run's time axis. Spans keep a 2px gap of
// track between them, and finished ones alternate two steps of the done hue, so where one stage ends
// shows. A span still going has a light moving across it; a tiny one keeps a 2px sliver.
export function SpanBar({ spans, total, className, height = 'h-1.5' }: { spans: Span[]; total: number; className?: string; height?: string }) {
  return (
    <span className={cn('relative block w-full overflow-hidden rounded-full bg-sunken', height, className)} aria-hidden>
      {spans.map((s, i) => (
        <span
          key={s.id}
          className={cn('absolute inset-y-0 rounded-full', FILL[s.state], s.state === 'done' && i % 2 === 1 && 'bg-ok/45', s.state === 'running' && 'shimmer')}
          style={{ left: `calc(${(s.start / total) * 100}% + 1px)`, width: `max(2px, calc(${(Math.max(0, s.end - s.start) / total) * 100}% - 2px))` }}
        />
      ))}
    </span>
  );
}
