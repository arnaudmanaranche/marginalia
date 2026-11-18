// One run of the bot on one MR, as a person follows it: the stages it goes through, which one it is
// on, every step the agent took, and how it ended. Pure: the caller stamps the times and stores
// the trace (run-journal.ts), so a whole run is tested on plain values.
import { failureKind } from './failure-kind.ts';


// What each kind of run does, in order, in the words the studio shows. A run of the staged
// pipelines (pipeline/) plans more stages as it learns them: one per chapter of a review, one per
// reviewer thread to fix.
const PREFLIGHT = (['preflight', 'Check that Claude, GitLab and git answer']);
export const STAGES = {
  understand: [
    ['checkout', 'Check out the default branch'],
    ['agent', 'Claude reads the repository and the team\'s tools'],
    ['report', 'Check and save the draft context'],
  ],
  review: [
    PREFLIGHT,
    ['checkout', 'Check out the MR branch'],
    ['context', 'Gather the MR, its ticket, its conversation and the last report'],
    ['map', 'Map the change: what it does and the order to read it in'],
    ['report', 'Weigh the findings and save the report'],
  ],
  triage: [
    PREFLIGHT,
    ['checkout', 'Check out the MR branch'],
    ['context', 'Gather the open reviewer threads and the code they are about'],
    ['conflicts', 'Merge the target branch in and settle its conflicts'],
    ['judge', 'Weigh each reviewer comment'],
    ['report', 'Write the replies and record the fixes'],
  ],
};

// A run keeps every step, up to this many: a runaway run must not grow its file without end.
export const MAX_STEPS = 2000;

export function startTrace({ id, slug, project, iid, kind, command, at, plan = kind }: { id: string, slug: string, project: string, iid: number | string | null, kind: 'review' | 'triage' | 'understand', command: string, at: string, plan?: keyof typeof STAGES }) {
  return {
    id, slug, project, iid, kind, command,
    startedAt: at,
    endedAt: null,
    outcome: 'running',
    error: null,
    // Why it failed, sorted (failure-kind.ts): set with a failed outcome.
    failure: null,
    stages: STAGES[plan].map(([sid, label]) => ({ id: sid, label, state: 'pending', startedAt: null, endedAt: null })),
    steps: [],
    droppedSteps: 0,
    cost: null as { usd: number; turns: number; outputTokens: number } | null,
  };
}


const running = (trace: any) => trace.stages.find((s: any) => s.state === 'running') ?? null;

// Moves the run on to stage `id`: the stage it was on is done, any it jumped over were skipped.
export function enterStage(trace: any, id: string, at: string) {
  const index = trace.stages.findIndex((s: any) => s.id === id);
  if (index < 0) return trace;
  const stages = trace.stages.map((s: any, i: number) => {
    if (i < index && s.state === 'running') return { ...s, state: 'done', endedAt: at };
    if (i < index && s.state === 'pending') return { ...s, state: 'skipped' };
    if (i === index) return { ...s, state: 'running', startedAt: at, endedAt: null };
    return s;
  });
  return { ...trace, stages };
}

// Stages learnt while running (the chapters a map found, the threads to fix), inserted after `after`.
export function planStages(trace: any, after: string, list: [string, string][]) {
  const index = trace.stages.findIndex((s: any) => s.id === after);
  const fresh = list.filter(([id]) => !trace.stages.some((s: any) => s.id === id)).map(([id, label]) => ({ id, label, state: 'pending', startedAt: null, endedAt: null }));
  return { ...trace, stages: [...trace.stages.slice(0, index + 1), ...fresh, ...trace.stages.slice(index + 1)] };
}

// Stages that run side by side (chapters reviewed in parallel): each starts and ends on its own.
export function beginStage(trace: any, id: string, at: string) {
  return { ...trace, stages: trace.stages.map((s: any) => (s.id === id ? { ...s, state: 'running', startedAt: at, endedAt: null } : s)) };
}
export function endStage(trace: any, id: string, at: string, state = 'done') {
  return { ...trace, stages: trace.stages.map((s: any) => (s.id === id ? { ...s, state, endedAt: at } : s)) };
}

// `tool`: the short name of the tool the step called (tool-label.ts), for the studio's chips.
export function addStep(trace: any, text: string, at: string, { sub = false, stage, tool = null }: { sub?: boolean; stage?: string; tool?: string | null } = {}) {
  if (trace.steps.length >= MAX_STEPS) return { ...trace, droppedSteps: trace.droppedSteps + 1 };
  return { ...trace, steps: [...trace.steps, { at, text, stage: stage ?? running(trace)?.id ?? null, sub, ...(tool && { tool }) }] };
}

// How the run ended. A failure marks the stages it happened in (all that were running: several run
// side by side); a success closes the last one; a skip leaves what never started as skipped.
export function finishTrace(trace: any, outcome: 'reviewed' | 'skipped' | 'failed', at: string, error: string | null = null) {
  const stages = trace.stages.map((s: any) => {
    if (s.state === 'running') return { ...s, state: (outcome === 'failed' ? 'failed' : outcome === 'skipped' ? 'skipped' : 'done'), endedAt: at };
    if (s.state === 'pending') return { ...s, state: 'skipped' };
    return s;
  });
  return { ...trace, stages, outcome, endedAt: at, error: error ? String(error).slice(0, 4000) : null, failure: outcome === 'failed' ? failureKind(error) : null };
}

// What the bot's live status carries about the run in progress: enough for the list and the reader
// to say where it is without reading the trace file. The full step log is read from the trace.
export const LIVE_STEPS = 8;
export function liveSummary(trace: any) {
  return {
    runId: trace.id,
    slug: trace.slug,
    stages: trace.stages.map(({ id, label, state }: any) => ({ id, label, state })),
    progress: trace.steps.slice(-LIVE_STEPS).map((s: any) => s.text),
    stepCount: trace.steps.length + trace.droppedSteps,
  };
}

// A run as a line of an MR's run history: the trace without its steps and tool calls.
export function runSummary(trace: any) {
  const { steps, calls, found, ...rest } = trace;
  return { ...rest, stepCount: steps.length + trace.droppedSteps };
}
