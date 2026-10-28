// @ts-check
import { basename } from 'node:path';
import { logger } from './logger.mjs';
import { reviewId } from './review-id.mjs';
import { status, writeStatus } from './status.mjs';
import { openTranscript, pruneTraces, runId, saveTrace } from './run-journal.mjs';
import { addStep, enterStage, finishTrace, liveSummary, startTrace } from './run-trace.mjs';

// Steps come in bursts (a tool call, its narration): the trace and the live status are written
// at most this often while the run goes, and at once on a stage change or at the end.
const FLUSH_MS = 750;

// Follows one run of `mr`: its trace on disk (run-journal.mjs), the live status the studio and the
// menu bar read, and the raw transcript. Nothing here may fail a review: a write that fails is logged.
/** @param {any} mr @param {{ kind: 'review' | 'triage', command: string, outputPath: string }} run */
export async function trackRun(mr, { kind, command, outputPath }) {
  const at = new Date().toISOString();
  let trace = startTrace({ id: runId(at, kind), slug: reviewId(mr.project, basename(outputPath, '.md')), project: mr.project.key, iid: mr.iid, kind, command, at });
  const transcript = await openTranscript(trace).catch((err) => {
    logger.warn({ err }, 'Could not open the run transcript');
    return null;
  });
  transcript?.on('error', (err) => logger.warn({ err }, 'Could not write the run transcript'));
  void pruneTraces(trace.project, basename(outputPath, '.md')).catch(() => {});

  /** @type {NodeJS.Timeout | null} */
  let timer = null;
  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (status.current && String(status.current.iid) === String(mr.iid) && status.current.project === mr.project.key) {
      Object.assign(status.current, liveSummary(trace));
      void writeStatus();
    }
    await saveTrace(trace).catch((err) => logger.warn({ err }, 'Could not save the run trace'));
  };
  const later = () => {
    timer ??= setTimeout(() => void flush(), FLUSH_MS);
  };
  await flush();

  return {
    get id() {
      return trace.id;
    },
    /** @param {string} id */
    stage(id) {
      trace = enterStage(trace, id, new Date().toISOString());
      return flush();
    },
    /** @param {string} text @param {{ sub?: boolean }} [opts] */
    step(text, opts) {
      trace = addStep(trace, text, new Date().toISOString(), opts);
      later();
    },
    /** @param {string} line one raw event of the stream */
    event(line) {
      transcript?.write(`${line}\n`);
    },
    /** @param {{ costUsd: number, turns: number, outputTokens: number }} stats */
    cost(stats) {
      trace = { ...trace, cost: { usd: stats.costUsd, turns: stats.turns, outputTokens: stats.outputTokens } };
    },
    /** @param {'reviewed' | 'skipped' | 'failed'} outcome @param {string | null} [error] */
    async finish(outcome, error = null) {
      trace = finishTrace(trace, outcome, new Date().toISOString(), error);
      await flush();
      await new Promise((resolve) => (transcript ? transcript.end(resolve) : resolve(null)));
      return trace;
    },
  };
}
