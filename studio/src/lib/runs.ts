import type { Failure, RunStage, RunSummary } from './api';

// How long something took, the way a person says it: 42s, 3m 05s, 1h 02m.
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

const ms = (iso: string) => new Date(iso).getTime();

// How long a stage took, or has been going for; null for one that never started.
export function stageTime(stage: RunStage, now: number): string | null {
  if (!stage.startedAt) return null;
  return duration((stage.endedAt ? ms(stage.endedAt) : now) - ms(stage.startedAt));
}

export function runTime(run: RunSummary, now: number): string {
  return duration((run.endedAt ? ms(run.endedAt) : now) - ms(run.startedAt));
}

// The stage a run is on (running) or stopped at (failed).
export const stageAt = (run: RunSummary) => run.stages.find((s) => s.state === 'running' || s.state === 'failed') ?? null;

export type Tone = 'info' | 'danger' | 'warning' | 'neutral';

// One line on where the bot stands with this review, and a second one with the detail.
// `awaiting` is set while the MR has no report yet: queued, or its first review failed. A failure that
// passes by itself (GitLab unreachable, Claude overloaded) is a warning, not an alarm.
export function runHeadline(run: RunSummary | null, { awaiting, now, failure = null }: { awaiting: 'queued' | 'failed' | null; now: number; failure?: Failure | null }): { tone: Tone; title: string; detail: string } | null {
  if (!run && awaiting === 'failed') {
    return failure
      ? { tone: failure.transient ? 'warning' : 'danger', title: failure.title, detail: failure.transient ? 'Retrying soon, on its own.' : 'It is tried again on the next poll. That run is older than run recording, so its steps were not kept.' }
      : { tone: 'danger', title: 'The first review failed', detail: 'It is tried again on the next poll. That run is older than run recording, so its steps were not kept.' };
  }
  if (!run) return awaiting ? { tone: 'neutral', title: 'Waiting for its first review', detail: 'The bot takes it in this poll. This page follows the run as soon as it starts.' } : null;
  const doing = run.kind === 'triage' ? 'Answering the reviewers' : 'Reviewing';
  const at = stageAt(run);
  const position = at ? `Step ${run.stages.indexOf(at) + 1} of ${run.stages.length}: ${at.label}` : '';
  if (run.outcome === 'running') return { tone: 'info', title: `${doing} now`, detail: `${position} · ${runTime(run, now)}` };
  if (run.outcome === 'failed') {
    const when = at ? `During "${at.label}", after ${runTime(run, now)}.` : `After ${runTime(run, now)}.`;
    if (run.failure?.transient) return { tone: 'warning', title: `${run.failure.title}: retrying soon`, detail: when };
    return { tone: 'danger', title: run.failure && run.failure.kind !== 'unknown' ? run.failure.title : 'The last run failed', detail: when };
  }
  if (run.outcome === 'skipped') return { tone: 'warning', title: 'The last run was skipped', detail: run.error ?? 'It is tried again on the next poll.' };
  const cost = run.cost ? ` · $${run.cost.usd.toFixed(2)}` : '';
  return { tone: 'neutral', title: 'Last run finished', detail: `Took ${runTime(run, now)}${cost}.` };
}

// The run to warn about on a report: the newest one, when it failed or was skipped after the report
// on screen was written, so what is shown is older than what the bot tried.
export function runToFlag(runs: RunSummary[] | null, reviewedAt: string | undefined): RunSummary | null {
  const last = runs?.[0];
  if (!last || (last.outcome !== 'failed' && last.outcome !== 'skipped')) return null;
  if (reviewedAt && ms(last.startedAt) < ms(reviewedAt)) return null;
  return last;
}
