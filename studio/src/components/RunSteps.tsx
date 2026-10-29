import { Fragment, useEffect, useRef } from 'react';
import { CornerDownRight } from 'lucide-react';
import type { RunStage, RunStep } from '../lib/api';
import { duration } from '../lib/runs';
import { cn } from '../lib/utils';

// Every step of a run, in order, under the stage it was taken in. A step a sub-agent took is set in
// under the one that started it. While the run goes, the log follows the newest step unless the
// person scrolled up to read.
export function RunSteps({ steps, stages, startedAt, running, total }: { steps: RunStep[]; stages: RunStage[]; startedAt: string; running: boolean; total: number }) {
  const box = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = box.current;
    if (el && running && pinned.current) el.scrollTop = el.scrollHeight;
  }, [steps.length, running]);
  if (!steps.length) return <p className="text-sm text-fg-muted">{running ? 'No step yet: the agent is starting.' : 'This run took no step.'}</p>;
  const label = (id: string | null) => stages.find((s) => s.id === id)?.label ?? 'Before the first stage';
  const t0 = new Date(startedAt).getTime();
  return (
    <>
      <ol
        ref={box}
        aria-label="Steps of the run"
        aria-live={running ? 'polite' : undefined}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="max-h-96 overflow-y-auto rounded-md border border-line bg-canvas py-1 font-mono text-xs leading-5"
      >
        {steps.map((s, i) => (
          <Fragment key={i}>
            {(i === 0 || steps[i - 1].stage !== s.stage) && (
              <li className="sticky top-0 bg-canvas px-3 pt-1.5 pb-0.5 font-sans text-[11px] font-medium uppercase tracking-wide text-fg-muted">{label(s.stage)}</li>
            )}
            <li className={cn('flex gap-3 px-3', s.sub && 'pl-6')}>
              <span className="w-14 shrink-0 select-none text-right tabular-nums text-fg-subtle">+{duration(new Date(s.at).getTime() - t0)}</span>
              {s.sub && <CornerDownRight className="mt-1 size-3 shrink-0 text-fg-subtle" aria-label="Sub-agent" />}
              <span className="min-w-0 break-words">{s.text}</span>
            </li>
          </Fragment>
        ))}
      </ol>
      {total > steps.length && <p className="mt-1 text-xs text-fg-subtle">{total - steps.length} later steps were not kept (a run keeps its first {steps.length}).</p>}
    </>
  );
}
