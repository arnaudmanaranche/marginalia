import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock, Loader2, MinusCircle, XCircle } from 'lucide-react';
import type { Failure, RunStage } from '../lib/api';
import { useRun, useRuns } from '../lib/useRuns';
import { useNow } from '../lib/useNow';
import { runHeadline, runTime, stageTime, type Tone } from '../lib/runs';
import { cn, timeAgo } from '../lib/utils';
import { NoteMarkdown } from './NoteMarkdown';
import { DoctorCard } from './DoctorCard';
import { RunSteps } from './RunSteps';

const TONE: Record<Tone, string> = {
  info: 'border-blue-500/30 bg-blue-500/5',
  danger: 'border-red-500/40 bg-red-500/5',
  warning: 'border-amber-500/40 bg-amber-500/5',
  neutral: 'border-line bg-surface',
};

function StageIcon({ state }: { state: RunStage['state'] }) {
  if (state === 'done') return <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="Done" />;
  if (state === 'running') return <Loader2 className="size-4 animate-spin text-blue-600 motion-reduce:animate-pulse dark:text-blue-400" aria-label="In progress" />;
  if (state === 'failed') return <XCircle className="size-4 text-red-600 dark:text-red-400" aria-label="Failed" />;
  if (state === 'skipped') return <MinusCircle className="size-4 text-fg-subtle" aria-label="Skipped" />;
  return <Circle className="size-4 text-fg-subtle" aria-label="Not started" />;
}

// The bot's activity on this review while a run is on: its stages and each step as it happens, a
// passing state that goes once the run ends. A run that failed stays, with why and the doctor.
// `awaiting`: no report yet, so this is the whole page. `collapsible`: a report is on screen and a
// failed run sits over it, folded to its headline until opened.
export function RunPanel({ slug, awaiting, failure = null, collapsible = false, defaultOpen = true, liveRunId }: { slug: string; awaiting: 'queued' | 'failed' | null; failure?: Failure | null; collapsible?: boolean; defaultOpen?: boolean; liveRunId?: string | null }) {
  const runs = useRuns(slug);
  const [open, setOpen] = useState(defaultOpen);
  const selectedId = liveRunId ?? runs?.[0]?.id ?? null;
  const trace = useRun(slug, selectedId);
  const run = trace ?? runs?.find((r) => r.id === selectedId) ?? null;
  const running = run?.outcome === 'running';
  const now = useNow(running);
  const headline = runHeadline(run, { awaiting, now, failure });
  // What to do about a known kind of failure; an unknown one is the doctor's to explain, below.
  const why = (run?.failure ?? (run ? null : failure)) ?? null;
  const advice = why && why.kind !== 'unknown' ? why : null;
  if (!headline) return null;
  const expanded = !collapsible || open;

  return (
    <section aria-label="Bot activity" className={cn('mb-4 shrink-0 rounded-lg border p-4', TONE[headline.tone])}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          disabled={!collapsible}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={collapsible ? open : undefined}
          className="flex min-w-0 flex-1 items-start gap-2 text-left disabled:cursor-default"
        >
          {collapsible && (open ? <ChevronDown className="mt-0.5 size-4 shrink-0" aria-hidden /> : <ChevronRight className="mt-0.5 size-4 shrink-0" aria-hidden />)}
          {headline.tone === 'danger' ? <XCircle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
            : headline.tone === 'warning' ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            : running ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-blue-600 motion-reduce:animate-pulse dark:text-blue-400" aria-hidden />
            : <Clock className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />}
          <span className="min-w-0">
            <span className="block font-medium">{headline.title}</span>
            <span className="block text-sm text-fg-muted">{headline.detail}</span>
          </span>
        </button>
      </div>

      {expanded && advice && (
        <div className="mt-3 rounded-md border border-line bg-surface p-3 text-sm">
          <p className="font-medium">{advice.transient ? 'Nothing to do for now' : 'What to do'}</p>
          <NoteMarkdown className="text-fg-muted">{advice.advice}</NoteMarkdown>
        </div>
      )}
      {expanded && run && (
        <div className="mt-4 space-y-4">
          <ol aria-label="Stages" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {run.stages.map((s, i) => (
              <li key={s.id} className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-sm', s.state === 'running' ? 'border-blue-500/40 bg-surface' : s.state === 'failed' ? 'border-red-500/40 bg-surface' : 'border-line')}>
                <span className="mt-0.5 shrink-0"><StageIcon state={s.state} /></span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block leading-snug', (s.state === 'pending' || s.state === 'skipped') && 'text-fg-muted')}><span className="sr-only">Stage {i + 1}: </span>{s.label}</span>
                  <span className="block text-xs tabular-nums text-fg-subtle">{s.state === 'skipped' ? 'skipped' : stageTime(s, now) ?? 'waiting'}</span>
                </span>
              </li>
            ))}
          </ol>
          {run.error && (
            <div role="alert" className="rounded-md border border-red-500/30 bg-surface p-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-red-700 dark:text-red-300">{run.outcome === 'skipped' ? 'Why it was skipped' : 'Error'}</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5">{run.error}</pre>
            </div>
          )}
          {run.outcome === 'failed' && trace && <DoctorCard slug={slug} runId={trace.id} doctor={trace.doctor} failure={trace.failure} fix={trace.fix} fixSource={trace.fixSource} />}
          <div>
            <p className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs text-fg-muted">
              <span className="font-medium uppercase tracking-wide">What the agent did ({run.stepCount} steps)</span>
              <span className="tabular-nums">
                Started {timeAgo(run.startedAt)} · {runTime(run, now)}
                {run.cost && ` · $${run.cost.usd.toFixed(2)} · ${run.cost.turns} turns`}
              </span>
            </p>
            {trace ? <RunSteps steps={trace.steps} stages={trace.stages} startedAt={trace.startedAt} running={running} total={trace.stepCount} /> : <p className="text-sm text-fg-muted">Loading the steps…</p>}
          </div>
        </div>
      )}
    </section>
  );
}
