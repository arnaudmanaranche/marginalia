// One run of the bot on one MR, as a person follows it: the stages it goes through, which one it is
// on, every step the agent took, and how it ended. Pure: the caller stamps the times and stores
// the trace (run-journal.ts), so a whole run is tested on plain values.
import { failureKind } from './failure-kind.ts';

/** @typedef {'pending' | 'running' | 'done' | 'failed' | 'skipped'} StageState */
/** @typedef {{ id: string, label: string, state: StageState, startedAt: string | null, endedAt: string | null }} Stage */
/** @typedef {{ at: string, text: string, stage: string | null, sub: boolean }} Step */
/** @typedef {'running' | 'reviewed' | 'skipped' | 'failed'} Outcome */

// What each kind of run does, in order, in the words the studio shows. A run of the staged
// pipelines (lib/pipeline) gets its own list, and plans more stages as it learns them: one per
// chapter of a review, one per reviewer thread to fix.
const PREFLIGHT = /** @type {[string, string]} */ (['preflight', 'Check that Claude, GitLab and git answer']);
export const STAGES = {
  review: [
    PREFLIGHT,
    ['checkout', 'Check out the MR branch'],
    ['context', 'Read the conversation and the last report'],
    ['agent', 'Claude reviews the MR'],
    ['report', 'Save the report'],
  ],
  triage: [
    PREFLIGHT,
    ['checkout', 'Check out the MR branch'],
    ['context', 'Read the reviewer threads and the last report'],
    ['agent', 'Claude answers the reviewers and fixes what they found'],
    ['report', 'Save the replies and record the fixes'],
  ],
  'staged-review': [
    PREFLIGHT,
    ['checkout', 'Check out the MR branch'],
    ['context', 'Gather the MR, its ticket, its conversation and the last report'],
    ['map', 'Map the change: what it does and the order to read it in'],
    ['report', 'Weigh the findings and save the report'],
  ],
  'staged-triage': [
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

/**
 * @param {{ id: string, slug: string, project: string, iid: number | string, kind: 'review' | 'triage', command: string, at: string, plan?: keyof typeof STAGES }} input
 */
export function startTrace({ id, slug, project, iid, kind, command, at, plan = kind }: { id: string, slug: string, project: string, iid: number | string, kind: 'review' | 'triage', command: string, at: string, plan?: keyof typeof STAGES }) {
  return {
    id, slug, project, iid, kind, command,
    startedAt: at,
    endedAt: /** @type {string | null} */ (null),
    outcome: /** @type {Outcome} */ ('running'),
    error: /** @type {string | null} */ (null),
    // Why it failed, sorted (failure-kind.ts): set with a failed outcome.
    failure: /** @type {import('./failure-kind.ts').Failure | null} */ (null),
    stages: STAGES[plan].map(([sid, label]) => /** @type {Stage} */ ({ id: sid, label, state: 'pending', startedAt: null, endedAt: null })),
    steps: /** @type {Step[]} */ ([]),
    droppedSteps: 0,
    cost: null as { usd: number; turns: number; outputTokens: number } | null,
  };
}

/** @typedef {ReturnType<typeof startTrace>} Trace */

const running = (trace: any) => trace.stages.find((s: any) => s.state === 'running') ?? null;

// Moves the run on to stage `id`: the stage it was on is done, any it jumped over were skipped.
/** @param {Trace} trace @param {string} id @param {string} at */
export function enterStage(trace: any, id: string, at: string) {
  const index = trace.stages.findIndex((s: any) => s.id === id);
  if (index < 0) return trace;
  const stages = trace.stages.map((s: any, i: number) => {
    if (i < index && s.state === 'running') return { ...s, state: /** @type {StageState} */ ('done'), endedAt: at };
    if (i < index && s.state === 'pending') return { ...s, state: /** @type {StageState} */ ('skipped') };
    if (i === index) return { ...s, state: /** @type {StageState} */ ('running'), startedAt: at, endedAt: null };
    return s;
  });
  return { ...trace, stages };
}

// Stages learnt while running (the chapters a map found, the threads to fix), inserted after `after`.
/** @param {Trace} trace @param {string} after @param {[string, string][]} list */
export function planStages(trace: any, after: string, list: [string, string][]) {
  const index = trace.stages.findIndex((s: any) => s.id === after);
  const fresh = list.filter(([id]) => !trace.stages.some((s: any) => s.id === id)).map(([id, label]) => /** @type {Stage} */ ({ id, label, state: 'pending', startedAt: null, endedAt: null }));
  return { ...trace, stages: [...trace.stages.slice(0, index + 1), ...fresh, ...trace.stages.slice(index + 1)] };
}

// Stages that run side by side (chapters reviewed in parallel): each starts and ends on its own.
/** @param {Trace} trace @param {string} id @param {string} at */
export function beginStage(trace: any, id: string, at: string) {
  return { ...trace, stages: trace.stages.map((s: any) => (s.id === id ? { ...s, state: /** @type {StageState} */ ('running'), startedAt: at, endedAt: null } : s)) };
}
/** @param {Trace} trace @param {string} id @param {string} at @param {StageState} [state] */
export function endStage(trace: any, id: string, at: string, state = 'done') {
  return { ...trace, stages: trace.stages.map((s: any) => (s.id === id ? { ...s, state, endedAt: at } : s)) };
}

/** @param {Trace} trace @param {string} text @param {string} at @param {{ sub?: boolean, stage?: string }} [opts] */
export function addStep(trace: any, text: string, at: string, { sub = false, stage }: { sub?: boolean; stage?: string } = {}) {
  if (trace.steps.length >= MAX_STEPS) return { ...trace, droppedSteps: trace.droppedSteps + 1 };
  return { ...trace, steps: [...trace.steps, { at, text, stage: stage ?? running(trace)?.id ?? null, sub }] };
}

// How the run ended. A failure marks the stages it happened in (all that were running: several run
// side by side); a success closes the last one; a skip leaves what never started as skipped.
/** @param {Trace} trace @param {Exclude<Outcome, 'running'>} outcome @param {string} at @param {string | null} [error] */
export function finishTrace(trace: any, outcome: 'reviewed' | 'skipped' | 'failed', at: string, error: string | null = null) {
  const stages = trace.stages.map((s: any) => {
    if (s.state === 'running') return { ...s, state: /** @type {StageState} */ (outcome === 'failed' ? 'failed' : outcome === 'skipped' ? 'skipped' : 'done'), endedAt: at };
    if (s.state === 'pending') return { ...s, state: /** @type {StageState} */ ('skipped') };
    return s;
  });
  return { ...trace, stages, outcome, endedAt: at, error: error ? String(error).slice(0, 4000) : null, failure: outcome === 'failed' ? failureKind(error) : null };
}

// What the bot's live status carries about the run in progress: enough for the list and the reader
// to say where it is without reading the trace file. The full step log is read from the trace.
export const LIVE_STEPS = 8;
/** @param {Trace} trace */
export function liveSummary(trace: any) {
  return {
    runId: trace.id,
    slug: trace.slug,
    stages: trace.stages.map(({ id, label, state }: any) => ({ id, label, state })),
    progress: trace.steps.slice(-LIVE_STEPS).map((s: any) => s.text),
    stepCount: trace.steps.length + trace.droppedSteps,
  };
}

// A run as a line of an MR's run history: the trace without its steps.
/** @param {Trace} trace */
export function runSummary(trace: any) {
  const { steps, ...rest } = trace;
  return { ...rest, stepCount: steps.length + trace.droppedSteps };
}
