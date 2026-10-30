import { basename } from 'node:path';
import { logger } from './logger.ts';
import { reviewId } from './review-id.ts';
import { status, writeStatus } from './status.ts';
import { openTranscript, pruneTraces, runId, saveTrace } from './run-journal.ts';
import { addStep, beginStage, endStage, enterStage, finishTrace, liveSummary, planStages, startTrace } from './run-trace.ts';

// Steps come in bursts (a tool call, its narration): the trace and the live status are written
// at most this often while the run goes, and at once on a stage change or at the end.
const FLUSH_MS = 750;

// Follows one run of `mr`: its trace on disk (run-journal.ts), the live status the studio and the
// menu bar read, and the raw transcript. Nothing here may fail a review: a write that fails is logged.
// `plan`: the stage list to start from (see STAGES in run-trace.ts), the kind's own by default.
/** @param {any} mr @param {{ kind: 'review' | 'triage', command: string, outputPath: string, plan?: 'review' | 'triage' | 'staged-review' | 'staged-triage' }} run */
export async function followRun(mr: any, { kind, command, outputPath, plan }: any) {
  const at = new Date().toISOString();
  let trace = startTrace({ id: runId(at, kind), slug: reviewId(mr.project, basename(outputPath, '.md')), project: mr.project.key, iid: mr.iid, kind, command, at, plan });
  const transcript = await openTranscript(trace).catch((err) => {
    logger.warn({ err }, 'Could not open the run transcript');
    return null;
  });
  transcript?.on('error', (err) => logger.warn({ err }, 'Could not write the run transcript'));
  void pruneTraces(trace.project, basename(outputPath, '.md')).catch(() => {});

  /** @type {NodeJS.Timeout | null} */
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Stages running side by side flush at the same time: saves go one after the other, each
  // writing the trace as it is by then.
  let saving = Promise.resolve();
  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (status.current && String(status.current.iid) === String(mr.iid) && status.current.project === mr.project.key) {
      Object.assign(status.current, liveSummary(trace));
      void writeStatus();
    }
    saving = saving.then(() => saveTrace(trace)).catch((err) => logger.warn({ err }, 'Could not save the run trace'));
    await saving;
  };
  const later = () => {
    timer ??= setTimeout(() => void flush(), FLUSH_MS);
  };
  await flush();

  return {
    get id() {
      return trace.id;
    },
    get startedAt() {
      return trace.startedAt;
    },
    // What the run cost so far, all its Claude calls added up; null before the first one.
    get cost() {
      return trace.cost;
    },
    /** @param {string} id */
    stage(id: any) {
      trace = enterStage(trace, id, new Date().toISOString());
      return flush();
    },
    /** @param {string} after @param {[string, string][]} list stages learnt while running, in order */
    plan(after: any, list: any) {
      trace = planStages(trace, after, list);
      return flush();
    },
    /** @param {string} id a stage that runs side by side with others */
    begin(id: any) {
      trace = beginStage(trace, id, new Date().toISOString());
      return flush();
    },
    /** @param {string} id @param {'done' | 'failed' | 'skipped'} [state] */
    end(id: any, state = 'done') {
      trace = endStage(trace, id, new Date().toISOString(), state);
      return flush();
    },
    /** @param {string} text @param {{ sub?: boolean, stage?: string }} [opts] */
    step(text: string, opts: any) {
      trace = addStep(trace, text, new Date().toISOString(), opts);
      later();
    },
    /** @param {string} line one raw event of the stream */
    event(line: string) {
      transcript?.write(`${line}\n`);
    },
    // Adds up: a staged run makes one Claude call per stage.
    /** @param {{ costUsd: number, turns: number, outputTokens: number }} stats */
    addCost(stats: any) {
      const was = trace.cost ?? { usd: 0, turns: 0, outputTokens: 0 };
      trace = { ...trace, cost: { usd: was.usd + stats.costUsd, turns: was.turns + stats.turns, outputTokens: was.outputTokens + stats.outputTokens } };
    },
    /** @param {'reviewed' | 'skipped' | 'failed'} outcome @param {string | null} [error] */
    async finish(outcome: 'reviewed' | 'skipped' | 'failed', error: string | null = null) {
      trace = finishTrace(trace, outcome, new Date().toISOString(), error);
      await flush();
      await new Promise((resolve) => (transcript ? transcript.end(resolve) : resolve(null)));
      return trace;
    },
  };
}
