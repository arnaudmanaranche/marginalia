import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ChevronRight, ListChecks } from 'lucide-react';
import type { Failure } from '../lib/api';
import { useRun, useRuns } from '../lib/useRuns';
import { useNow } from '../lib/useNow';
import { unfold } from '../lib/motion';
import { position } from '../lib/plan';
import { runHeadline, runTime, type Tone } from '../lib/runs';
import { cn } from '../lib/utils';
import { NoteMarkdown } from './NoteMarkdown';
import { DoctorCard } from './DoctorCard';
import { RunSteps } from './RunSteps';
import { RunPlan } from './RunPlan';
import { AgentMonitor } from './AgentMonitor';
import { agentsOf } from '../lib/agents';
import { LivePill, type LiveTone } from './ds/LivePill';
import { Panel, PanelFooter, PanelHeader } from './ds/Panel';
import { StatusMark } from './ds/StatusMark';

const PILL: Record<Tone, { tone: LiveTone; label: string }> = {
  info: { tone: 'run', label: 'Running' },
  danger: { tone: 'fail', label: 'Failed' },
  warning: { tone: 'warn', label: 'Retrying' },
  neutral: { tone: 'idle', label: 'Waiting' },
};

// The bot's activity on this review, as a plan the person watches fill: each stage on a rail, what
// the agent is doing now, the tools it calls and the time it takes. It goes once the run ends; a
// failed run stays, folded to its headline when a report is on screen, with why and the doctor.
export function RunPanel({ slug, awaiting, failure = null, collapsible = false, defaultOpen = true, liveRunId }: { slug: string; awaiting: 'queued' | 'failed' | null; failure?: Failure | null; collapsible?: boolean; defaultOpen?: boolean; liveRunId?: string | null }) {
  const runs = useRuns(slug);
  const [open, setOpen] = useState(defaultOpen);
  const [log, setLog] = useState(false);
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
  const pill = run && run.outcome === 'reviewed' ? { tone: 'ok' as const, label: 'Done' } : PILL[headline.tone];
  const at = run ? position(run.stages) : null;
  // Each stage that ran Claude, as an agent at work; when a run had many, the finished ones fold.
  const agents = trace ? agentsOf(trace) : [];

  return (
    <Panel label="Bot activity" className={cn('mb-4 shrink-0', headline.tone === 'danger' && 'border-fail/40', headline.tone === 'warning' && 'border-warn/40')}>
      <button type="button" disabled={!collapsible} onClick={() => setOpen((o) => !o)} aria-expanded={collapsible ? open : undefined} className="block w-full text-left disabled:cursor-default">
        <PanelHeader
          icon={collapsible ? <ChevronRight className={cn('size-4 transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-90')} aria-hidden /> : <ListChecks className="size-4" aria-hidden />}
          title={headline.title}
          // Say it once: the pill holds the time and the footer the position, so a live or finished run
          // names its command here; a failed or waiting one keeps its explanation.
          meta={run && (running || run.outcome === 'reviewed') ? run.command : headline.detail}
          aside={<LivePill tone={pill.tone} label={pill.label} live={running} detail={run ? runTime(run, now) : undefined} />}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <m.div {...unfold} className="overflow-hidden">
            <div className="space-y-4 border-t border-line px-4 py-4">
              {advice && (
                <div className="rounded-lg bg-sunken p-3 text-sm">
                  <p className="font-medium">{advice.transient ? 'Nothing to do for now' : 'What to do'}</p>
                  <NoteMarkdown className="text-fg-muted">{advice.advice}</NoteMarkdown>
                </div>
              )}
              {run && <div className="max-w-3xl"><RunPlan stages={run.stages} steps={trace?.steps} now={now} /></div>}
              {agents.length > 0 && (
                <section aria-label="Agents" className="grid gap-2 lg:grid-cols-2">
                  {agents.map((a) => <AgentMonitor key={`${trace!.id}:${a.id}`} agent={a} defaultFolded={agents.length > 2 && a.state === 'done'} />)}
                </section>
              )}
              {run?.error && (
                <div role="alert" className="rounded-lg border border-fail/30 p-3">
                  <p className="mb-1 text-xs font-medium text-fail">{run.outcome === 'skipped' ? 'Why it was skipped' : 'Error'}</p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5">{run.error}</pre>
                </div>
              )}
              {run?.outcome === 'failed' && trace && <DoctorCard slug={slug} runId={trace.id} doctor={trace.doctor} failure={trace.failure} fix={trace.fix} fixSource={trace.fixSource} />}
              {trace && trace.stepCount > 0 && (
                <div>
                  <button type="button" onClick={() => setLog((l) => !l)} aria-expanded={log} className="flex items-center gap-1 text-xs text-fg-muted hover:text-zinc-900 dark:hover:text-zinc-100">
                    <ChevronRight className={cn('size-3.5 transition-transform duration-200 motion-reduce:transition-none', log && 'rotate-90')} aria-hidden />
                    Full log · {trace.stepCount} steps
                  </button>
                  <AnimatePresence initial={false}>
                    {log && (
                      <m.div {...unfold} className="overflow-hidden pt-2">
                        <RunSteps steps={trace.steps} stages={trace.stages} startedAt={trace.startedAt} running={running} total={trace.stepCount} />
                      </m.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
            {run && at && (
              <PanelFooter>
                <span className="flex items-center gap-2">
                  <StatusMark state={running ? 'running' : run.outcome === 'failed' ? 'failed' : run.outcome === 'skipped' ? 'skipped' : 'done'} size={14} />
                  <span><span className="font-medium text-zinc-900 dark:text-zinc-100">{pill.label}</span> · {at.current} of {at.total}</span>
                </span>
                <span className="tabular-nums">
                  {runTime(run, now)}
                  {run.cost && ` · $${run.cost.usd.toFixed(2)} · ${run.cost.turns} turns`}
                </span>
              </PanelFooter>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}
