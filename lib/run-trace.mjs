// @ts-check
// One run of the bot on one MR, as a person follows it: the stages it goes through, which one it is
// on, every step the agent took, and how it ended. Pure: the caller stamps the times and stores
// the trace (run-journal.mjs), so a whole run is tested on plain values.
import { failureKind } from './failure-kind.mjs';

/** @typedef {'pending' | 'running' | 'done' | 'failed' | 'skipped'} StageState */
/** @typedef {{ id: string, label: string, state: StageState, startedAt: string | null, endedAt: string | null }} Stage */
/** @typedef {{ at: string, text: string, stage: string | null, sub: boolean }} Step */
/** @typedef {'running' | 'reviewed' | 'skipped' | 'failed'} Outcome */

// What each kind of run does, in order, in the words the studio shows.
const STAGES = {
  review: [
    ['checkout', 'Check out the MR branch'],
    ['context', 'Read the conversation and the last report'],
    ['agent', 'Claude reviews the MR'],
    ['report', 'Save the report'],
  ],
  triage: [
    ['checkout', 'Check out the MR branch'],
    ['context', 'Read the reviewer threads and the last report'],
    ['agent', 'Claude answers the reviewers and fixes what they found'],
    ['report', 'Save the replies and record the fixes'],
  ],
};

// A run keeps every step, up to this many: a runaway run must not grow its file without end.
export const MAX_STEPS = 2000;

/**
 * @param {{ id: string, slug: string, project: string, iid: number | string, kind: 'review' | 'triage', command: string, at: string }} input
 */
export function startTrace({ id, slug, project, iid, kind, command, at }) {
  return {
    id, slug, project, iid, kind, command,
    startedAt: at,
    endedAt: /** @type {string | null} */ (null),
    outcome: /** @type {Outcome} */ ('running'),
    error: /** @type {string | null} */ (null),
    // Why it failed, sorted (failure-kind.mjs): set with a failed outcome.
    failure: /** @type {import('./failure-kind.mjs').Failure | null} */ (null),
    stages: STAGES[kind].map(([sid, label]) => /** @type {Stage} */ ({ id: sid, label, state: 'pending', startedAt: null, endedAt: null })),
    steps: /** @type {Step[]} */ ([]),
    droppedSteps: 0,
    cost: /** @type {{ usd: number, turns: number, outputTokens: number } | null} */ (null),
  };
}

/** @typedef {ReturnType<typeof startTrace>} Trace */

const running = (trace) => trace.stages.find((s) => s.state === 'running') ?? null;

// Moves the run on to stage `id`: the stage it was on is done, any it jumped over were skipped.
/** @param {Trace} trace @param {string} id @param {string} at */
export function enterStage(trace, id, at) {
  const index = trace.stages.findIndex((s) => s.id === id);
  if (index < 0) return trace;
  const stages = trace.stages.map((s, i) => {
    if (i < index && s.state === 'running') return { ...s, state: /** @type {StageState} */ ('done'), endedAt: at };
    if (i < index && s.state === 'pending') return { ...s, state: /** @type {StageState} */ ('skipped') };
    if (i === index) return { ...s, state: /** @type {StageState} */ ('running'), startedAt: at, endedAt: null };
    return s;
  });
  return { ...trace, stages };
}

/** @param {Trace} trace @param {string} text @param {string} at @param {{ sub?: boolean }} [opts] */
export function addStep(trace, text, at, { sub = false } = {}) {
  if (trace.steps.length >= MAX_STEPS) return { ...trace, droppedSteps: trace.droppedSteps + 1 };
  return { ...trace, steps: [...trace.steps, { at, text, stage: running(trace)?.id ?? null, sub }] };
}

// How the run ended. A failure marks the stage it happened in; a success closes the last one;
// a skip leaves what never started as skipped.
/** @param {Trace} trace @param {Exclude<Outcome, 'running'>} outcome @param {string} at @param {string | null} [error] */
export function finishTrace(trace, outcome, at, error = null) {
  const current = running(trace);
  const stages = trace.stages.map((s) => {
    if (s === current) return { ...s, state: /** @type {StageState} */ (outcome === 'failed' ? 'failed' : outcome === 'skipped' ? 'skipped' : 'done'), endedAt: at };
    if (s.state === 'pending') return { ...s, state: /** @type {StageState} */ ('skipped') };
    return s;
  });
  return { ...trace, stages, outcome, endedAt: at, error: error ? String(error).slice(0, 4000) : null, failure: outcome === 'failed' ? failureKind(error) : null };
}

// What the bot's live status carries about the run in progress: enough for the list and the reader
// to say where it is without reading the trace file. The full step log is read from the trace.
export const LIVE_STEPS = 8;
/** @param {Trace} trace */
export function liveSummary(trace) {
  return {
    runId: trace.id,
    slug: trace.slug,
    stages: trace.stages.map(({ id, label, state }) => ({ id, label, state })),
    progress: trace.steps.slice(-LIVE_STEPS).map((s) => s.text),
    stepCount: trace.steps.length + trace.droppedSteps,
  };
}

// A run as a line of an MR's run history: the trace without its steps.
/** @param {Trace} trace */
export function runSummary(trace) {
  const { steps, ...rest } = trace;
  return { ...rest, stepCount: steps.length + trace.droppedSteps };
}
