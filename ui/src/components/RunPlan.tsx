import { AnimatePresence, m } from 'motion/react';
import { CornerDownRight } from 'lucide-react';
import type { RunStage, RunStep } from '../lib/api';
import { arrive } from '../lib/motion';
import { planRows } from '../lib/plan';
import { stageTime } from '../lib/runs';
import { cn } from '../lib/utils';
import { StatusMark } from './ds/StatusMark';
import { Timeline, TimelineItem } from './ds/Timeline';
import { ToolChip, ToolChips } from './ds/ToolChip';

// How many of the current stage's latest actions unfold under it while it runs.
const LIVE_LINES = 3;

// A run as its plan: every stage on the rail with its state, what it did, the tools it called and how
// long it took. The stage in progress unfolds its latest actions as they happen, each sliding in.
export function RunPlan({ stages, steps, now }: { stages: RunStage[]; steps?: RunStep[]; now: number }) {
  const rows = planRows(stages, steps);
  return (
    <Timeline label="Plan of the run">
      {rows.map(({ stage, steps: done, tools, latest }, i) => {
        const live = stage.state === 'running';
        const quiet = stage.state === 'pending' || stage.state === 'skipped';
        return (
          <TimelineItem
            key={stage.id}
            mark={<StatusMark state={stage.state} />}
            walked={stage.state === 'done'}
            last={i === rows.length - 1}
            current={live}
            aside={stage.state === 'skipped' ? 'skipped' : stageTime(stage, now) ?? ''}
          >
            <p className={cn('text-sm leading-5', live ? 'font-medium' : quiet && 'text-fg-muted')}>{stage.label}</p>
            {!live && latest && (
              <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                <span className="tabular-nums">{done.length} step{done.length > 1 ? 's' : ''}</span>
                <ToolChips names={tools} />
              </p>
            )}
            {live && (
              <ol aria-label={`Latest actions in ${stage.label}`} aria-live="polite" className="mt-1.5 space-y-1">
                <AnimatePresence initial={false}>
                  {done.slice(-LIVE_LINES).map((s, k, shown) => (
                    <m.li key={`${s.at}:${s.text}`} {...arrive} className={cn('flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-xs', k === shown.length - 1 ? 'bg-sunken text-zinc-900 dark:text-zinc-100' : 'text-fg-muted')}>
                      <CornerDownRight className="size-3 shrink-0 text-fg-subtle" aria-hidden />
                      <span className="min-w-0 flex-1 truncate" title={s.text}>{s.text}</span>
                      {s.tool && <ToolChip name={s.tool} />}
                    </m.li>
                  ))}
                </AnimatePresence>
                {!done.length && <li className="px-2 py-1 text-xs text-fg-muted">Starting…</li>}
              </ol>
            )}
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}
