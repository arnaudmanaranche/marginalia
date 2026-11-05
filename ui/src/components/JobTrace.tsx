import { ArrowRight } from 'lucide-react';
import type { Job } from '../lib/api';
import { routeOf } from '../lib/jobs';
import { duration } from '../lib/runs';
import { spansOf } from '../lib/trace';
import { useNow } from '../lib/useNow';
import { SpanBar } from './ds/SpanBar';
import { StatusMark } from './ds/StatusMark';
import { Button } from './ui/Button';

const TICKS = [0, 0.25, 0.5, 0.75, 1];

// One job opened as a waterfall: its stages on the run's own time axis, each where and as long as it
// ran, with its time; then why it failed, what it cost, and the way to what it was about.
export function JobTrace({ job, onOpen }: { job: Job; onOpen: (route: string) => void }) {
  const now = useNow(job.outcome === 'running');
  const { spans, total } = spansOf(job.stages, job.startedAt, now);
  return (
    <div className="bg-canvas px-4 pt-3 pb-4">
      <div className="grid grid-cols-[minmax(0,14rem)_1fr_4rem] items-center gap-x-3 gap-y-2 text-xs">
        <span />
        <span className="relative h-4 text-fg-muted" aria-hidden>
          {TICKS.map((t) => (
            <span key={t} className="absolute top-0 whitespace-nowrap tabular-nums" style={{ left: `${t * 100}%`, transform: t === 1 ? 'translateX(-100%)' : t === 0 ? undefined : 'translateX(-50%)' }}>{duration(total * t)}</span>
          ))}
        </span>
        <span />
        {job.stages.map((stage) => {
          const span = spans.find((s) => s.id === stage.id);
          return [
            <span key={`${stage.id}:l`} className="flex min-w-0 items-center gap-2">
              <StatusMark state={stage.state} size={14} />
              <span title={stage.label} className={stage.state === 'pending' || stage.state === 'skipped' ? 'truncate text-fg-muted' : 'truncate'}>{stage.label}</span>
            </span>,
            <SpanBar key={`${stage.id}:b`} spans={span ? [span] : []} total={total} height="h-2" />,
            <span key={`${stage.id}:t`} className="text-right tabular-nums text-fg-muted">{span ? duration(span.end - span.start) : stage.state === 'skipped' ? 'skipped' : ''}</span>,
          ];
        })}
      </div>
      {job.error && <p role="alert" className="mt-3 line-clamp-3 font-mono text-xs text-fail [overflow-wrap:anywhere]" title={job.error}>{job.error}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
        <span className="tabular-nums">{job.command}{job.cost && ` · $${job.cost.usd.toFixed(2)} · ${job.cost.turns} turns · ${job.cost.outputTokens.toLocaleString()} tokens`}</span>
        <Button size="sm" onClick={() => onOpen(routeOf(job))}>{job.what === 'understand' ? 'Open the project context' : 'Open the review'}<ArrowRight className="size-3.5" aria-hidden /></Button>
      </div>
    </div>
  );
}
