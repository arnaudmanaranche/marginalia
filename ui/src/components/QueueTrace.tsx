import { BACKPRESSURE, depthSeries, isQuiet, kindOf, type QueueTask } from '../lib/queue';
import type { Forecast } from '../lib/queueForecast';
import { duration } from '../lib/runs';
import { cn } from '../lib/utils';

const MIN = 60_000;
const PAST = 60 * MIN;
const STEP = 15 * MIN;
const FILL = { done: 'bg-ok', failed: 'bg-fail', running: 'bg-run shimmer', queued: '' } as const;
const lane = (p: string | null) => p ?? 'No project';
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// The line on one clock, the way a tracing tool draws spans: the last hour on the left, now as a
// line, what comes next on the right, past it. Each project is a lane (GLOSSARY: Queue): a poll that
// found nothing is a tick, a task that did something is a bar at its length, red when it failed.
// Ahead of now, waiting tasks and the next polls are dashed where the forecast puts them. Above the
// lanes, how many tasks waited, amber past the depth that means trouble; the next poll is a dashed
// line when it falls inside the clock. The lists below say all
// of it in words; a bar picks its task there.
export function QueueTrace({ tasks, now, forecast, nextPoll, onSelect }: { tasks: QueueTask[]; now: number; forecast: Forecast; nextPoll: number | null; onSelect: (id: string) => void }) {
  const until = Math.max(forecast.until, nextPoll !== null && nextPoll - now <= 30 * MIN ? nextPoll : now);
  const ahead = Math.min(30 * MIN, Math.max(10 * MIN, Math.ceil((until - now) / (5 * MIN)) * 5 * MIN));
  const from = now - PAST;
  const total = PAST + ahead;
  const x = (at: number) => Math.min(100, Math.max(0, ((at - from) / total) * 100));
  const nowX = x(now);
  const seen = tasks.filter((t) => !t.endedAt || Date.parse(t.endedAt) >= from);
  const lanes = [...new Set(seen.map((t) => lane(t.project)))].sort();
  const pollX = nextPoll !== null && nextPoll > now && nextPoll - now <= ahead ? x(nextPoll) : null;
  const ticks = [...Array.from({ length: PAST / STEP }, (_, i) => -PAST + i * STEP), 0, ...Array.from({ length: ahead / (5 * MIN) }, (_, i) => (i + 1) * 5 * MIN)];
  const series = depthSeries(tasks, now, PAST, 90);
  const peak = Math.max(...series.map((p) => p.depth));
  const top = Math.max(peak, BACKPRESSURE + 1);
  const steps = series.map((p, i) => `${i === 0 ? 'M0' : `H${((i / (series.length - 1)) * 100).toFixed(2)}`} V${(20 - (p.depth / top) * 18).toFixed(2)}`).join(' ');
  const over = peak > BACKPRESSURE;
  const worked = seen.filter((t) => !isQuiet(t) && t.status !== 'queued');
  const failed = worked.filter((t) => t.status === 'failed').length;
  const summary = `Over the last hour, ${seen.length - worked.length} polls found nothing and ${worked.length} task${worked.length === 1 ? '' : 's'} did work${failed ? `, ${failed} failed` : ''}; at most ${peak} waited at once.`;

  const bar = (t: QueueTask) => {
    const slot = forecast.slots.get(t.id);
    const enq = Date.parse(t.enqueuedAt);
    const start = t.startedAt ? Date.parse(t.startedAt) : slot?.start ?? now;
    const end = t.endedAt ? Date.parse(t.endedAt) : t.status === 'running' ? now : start;
    const tip = `${t.label} · ${kindOf(t)} · ${t.status === 'queued' ? `starts ~${clock(start)}` : `${t.status}, ran ${duration(end - start)} · ${clock(start)}`}`;
    if (isQuiet(t)) return <span key={t.id} title={tip} className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-fg-subtle" style={{ left: `${x(start)}%` }} />;
    const span = (a: number, b: number, cls: string, k: string) => (
      <span key={k} className={cn('absolute top-1/2 -translate-y-1/2', cls)} style={{ left: `${x(a)}%`, width: `max(3px, ${x(b) - x(a)}%)` }} />
    );
    return (
      <span key={t.id} role="presentation" title={tip} onClick={() => onSelect(t.id)} className="cursor-pointer">
        {t.startedAt && start - enq > MIN / 2 && span(enq, Math.min(start, now), 'h-px bg-line-strong', `${t.id}:w`)}
        {t.status !== 'queued' && span(start, end, cn('h-3 rounded-[3px] transition-[filter] hover:brightness-125', FILL[t.status]), `${t.id}:r`)}
        {slot && slot.end > now && span(Math.max(now, slot.start), slot.end, cn('h-3 rounded-[3px] border border-dashed', slot.known ? 'border-run/70 bg-run/10' : 'border-fg-subtle bg-sunken'), `${t.id}:f`)}
      </span>
    );
  };

  return (
    <figure className="m-0 px-4 pt-3 pb-3">
      <figcaption className="sr-only">{summary}</figcaption>
      <div aria-hidden className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-2 text-[11px] sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-x-3">
        <div className="grid auto-rows-min">
          <span className="h-5" />
          <span className="flex h-6 items-center text-fg-muted">Waiting</span>
          {lanes.map((l) => <span key={l} title={l} className="flex h-7 items-center truncate font-mono text-fg-muted">{l}</span>)}
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 right-0 rounded-r-md bg-sunken/70" style={{ left: `${nowX}%` }} />
          {ticks.map((t) => <span key={t} className="absolute top-5 bottom-0 w-px bg-line" style={{ left: `${x(now + t)}%` }} />)}
          <div className="relative h-5 text-fg-muted">
            {/* Labels: the past every 15 min (every 30 on a phone), now, and the far end of what comes next. */}
            {ticks.filter((t) => t <= 0 || t === ahead).map((t) => (
              <span key={t} className={cn('absolute top-0 whitespace-nowrap tabular-nums', t === ahead ? '-translate-x-full max-sm:hidden' : '-translate-x-1/2', t === 0 && 'font-medium text-run-ink', t < 0 && (t / STEP) % 2 !== 0 && 'max-sm:hidden')} style={{ left: `${x(now + t)}%` }}>
                {t === 0 ? 'now' : `${t < 0 ? '−' : '+'}${Math.abs(t) / MIN}m`}
              </span>
            ))}
          </div>
          <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="relative block h-6" style={{ width: `${nowX}%` }}>
            <path d={`${steps} H100 V20 H0 Z`} className={over ? 'fill-warn/25' : 'fill-run/15'} />
            <path d={steps} fill="none" className={over ? 'stroke-warn' : 'stroke-run'} strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
            <line x1="0" x2="100" y1={20 - (BACKPRESSURE / top) * 18} y2={20 - (BACKPRESSURE / top) * 18} className="stroke-fg-subtle" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          </svg>
          {lanes.map((l) => (
            <div key={l} className="relative h-7 border-t border-line/60">
              {seen.filter((t) => lane(t.project) === l).map(bar)}
            </div>
          ))}
          {pollX !== null && <span title={`Next poll at ${clock(nextPoll!)}`} className="absolute top-5 bottom-0 border-l border-dashed border-fg-subtle" style={{ left: `${pollX}%` }} />}
          <span className="absolute top-5 bottom-0 w-px bg-run" style={{ left: `${nowX}%` }} />
        </div>
      </div>
    </figure>
  );
}
