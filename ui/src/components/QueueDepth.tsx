import { BACKPRESSURE, depthSeries, type QueueTask } from '../lib/queue';
import { cn } from '../lib/utils';

const W = 600;
const H = 56;

// How many tasks waited over the last `window` ms, as a stepped area: the backlog building up while
// one task runs long, and draining. The dashed line is the depth that means trouble; above it the
// area turns amber. A sentence beside it says the same for screen readers.
export function QueueDepth({ tasks, now, window = 2 * 3600_000, className }: { tasks: QueueTask[]; now: number; window?: number; className?: string }) {
  const series = depthSeries(tasks, now, window, 72);
  const peak = Math.max(...series.map((p) => p.depth));
  const top = Math.max(peak, BACKPRESSURE + 1);
  const y = (d: number) => H - (d / top) * (H - 4);
  const x = (i: number) => (i / (series.length - 1)) * W;
  // A step per point: flat until the next one, then straight up or down to its depth.
  const steps = series.map((p, i) => (i === 0 ? `M0 ${y(p.depth).toFixed(1)}` : `H${x(i).toFixed(1)} V${y(p.depth).toFixed(1)}`)).join(' ');
  const area = `${steps} H${W} V${H} H0 Z`;
  const over = peak > BACKPRESSURE;
  const average = series.reduce((s, p) => s + p.depth, 0) / series.length;
  const hours = Math.round(window / 3600_000);
  return (
    <figure className={cn('m-0', className)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-14 w-full" aria-hidden>
        <path d={area} className={over ? 'fill-warn/20' : 'fill-run/15'} />
        <path d={steps} fill="none" className={over ? 'stroke-warn' : 'stroke-run'} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2={W} y1={y(BACKPRESSURE)} y2={y(BACKPRESSURE)} className="stroke-fg-subtle" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-fg-muted">
        <span>{hours}h ago</span>
        <span className="sr-only">{`Over the last ${hours} hours, at most ${peak} task${peak === 1 ? '' : 's'} waited at once, ${average.toFixed(1)} on average.`}</span>
        <span aria-hidden>Peak {peak} · avg {average.toFixed(1)}</span>
        <span>now</span>
      </figcaption>
    </figure>
  );
}
