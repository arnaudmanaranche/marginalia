import { useState } from 'react';
import type { Span } from '../../lib/trace';
import { cn } from '../../lib/utils';
import { SpanTip, type TipAt } from './SpanTip';

const FILL: Record<Span['state'], string> = { done: 'bg-ok/80', running: 'bg-run', failed: 'bg-fail', skipped: 'bg-idle/50', pending: 'bg-idle/30' };

// Spans on one track, each placed at its share of the total time and coloured by its state: a
// whole run's stages in one bar, or one stage alone on a run's time axis. Spans keep a 2px gap of
// track between them, and finished ones alternate two steps of the done hue, so where one stage ends
// shows. A span still going has a light moving across it; a tiny one keeps a 2px sliver. Hovering a
// span lifts it and opens a card with its timing; the bar stays decorative for assistive tech, the
// same facts being written beside it where it is used.
export function SpanBar({ spans, total, className, height = 'h-1.5' }: { spans: Span[]; total: number; className?: string; height?: string }) {
  const [tip, setTip] = useState<TipAt | null>(null);
  const show = (span: Span) => (e: React.MouseEvent<HTMLElement>) => setTip({ span, x: e.clientX, y: e.currentTarget.getBoundingClientRect().top });
  return (
    <span className={cn('relative block w-full', className)} aria-hidden onMouseLeave={() => setTip(null)}>
      <span className={cn('relative block w-full overflow-hidden rounded-full bg-sunken', height)}>
        {spans.map((s, i) => (
          <span
            key={s.id}
            className={cn('absolute inset-y-0 rounded-full transition-[filter] duration-150', FILL[s.state], s.state === 'done' && i % 2 === 1 && 'bg-ok/45', s.state === 'running' && 'shimmer', tip?.span.id === s.id && 'brightness-125')}
            style={{ left: `calc(${(s.start / total) * 100}% + 1px)`, width: `max(2px, calc(${(Math.max(0, s.end - s.start) / total) * 100}% - 2px))` }}
          />
        ))}
      </span>
      {spans.map((s) => (
        <span
          key={s.id}
          className="absolute -inset-y-1.5 min-w-1.5"
          style={{ left: `${(s.start / total) * 100}%`, width: `${(Math.max(0, s.end - s.start) / total) * 100}%` }}
          onMouseEnter={show(s)}
          onMouseMove={show(s)}
        />
      ))}
      {tip && <SpanTip at={tip} />}
    </span>
  );
}
