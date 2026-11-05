import { createPortal } from 'react-dom';
import { duration } from '../../lib/runs';
import type { Span } from '../../lib/trace';

export interface TipAt { span: Span; x: number; y: number }

const STATE: Record<Span['state'], string> = { done: 'Done', running: 'Running', failed: 'Failed', skipped: 'Skipped', pending: 'Pending' };
const TONE: Record<Span['state'], string> = { done: 'bg-ok', running: 'bg-run', failed: 'bg-fail', skipped: 'bg-idle', pending: 'bg-idle' };

// The details of one span, in a card above the pointer, following it along the span: which stage, its state, when it started and
// ended on the run's clock, and how long it took. Drawn on the page's body so no clipped list hides it,
// and kept inside the window's width.
export function SpanTip({ at }: { at: TipAt }) {
  const { span, x, y } = at;
  const left = Math.min(Math.max(x, 150), window.innerWidth - 150);
  return createPortal(
    <div role="tooltip" className="pointer-events-none fixed z-50 w-max min-w-44 max-w-72 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg shadow-black/20" style={{ left, top: y - 8 }}>
      <div className="flex items-center gap-2 font-medium">
        <span className={`size-2 shrink-0 rounded-full ${TONE[span.state]}`} aria-hidden />
        <span className="truncate">{span.label}</span>
        <span className="ml-auto shrink-0 font-normal text-fg-muted">{STATE[span.state]}</span>
      </div>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums text-fg-muted">
        <dt>Started</dt><dd className="text-right text-fg">+{duration(span.start)}</dd>
        <dt>{span.state === 'running' ? 'So far' : 'Ended'}</dt><dd className="text-right text-fg">+{duration(span.end)}</dd>
        <dt>Took</dt><dd className="text-right text-fg">{duration(span.end - span.start)}</dd>
      </dl>
    </div>,
    document.body,
  );
}
