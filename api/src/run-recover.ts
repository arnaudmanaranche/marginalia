import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from './logger.ts';
import { RUNS_DIR, readTrace, saveTrace } from './run-journal.ts';
import { finishTrace } from './run-trace.ts';

export const INTERRUPTED = 'Interrupted: the bot stopped while this run was going.';

const dirs = async (path: string) => {
  try {
    return (await readdir(path, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};

// A run is written as it goes, so one the bot never finished (killed or restarted mid-run) stays
// `running` on disk and the studio shows it live for ever. At start-up no run of this process
// exists yet: every trace still `running` belongs to a process that is gone, so it is closed as failed.
/** @param {string} [root] @param {string} [at] @returns the ids of the runs closed */
export async function closeInterruptedRuns(root = RUNS_DIR, at = new Date().toISOString()) {
  const closed: string[] = [];
  for (const project of await dirs(root)) {
    for (const review of await dirs(join(root, project))) {
      const names = (await readdir(join(root, project, review)).catch(() => [])).filter((n) => n.endsWith('.json') && !/\.(doctor|fix)\.json$/.test(n));
      for (const name of names) {
        const trace = await readTrace(project, review, name.slice(0, -'.json'.length), root);
        if (trace?.outcome !== 'running') continue;
        await saveTrace(finishTrace(trace, 'failed', at, INTERRUPTED), root);
        closed.push(trace.id);
      }
    }
  }
  if (closed.length) logger.warn({ closed }, 'Closed runs left running by a previous process');
  return closed;
}
