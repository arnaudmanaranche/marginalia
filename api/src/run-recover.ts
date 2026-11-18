import { logger } from './logger.ts';
import { reviewDirs, traceIdsIn } from './run-dirs.ts';
import { RUNS_DIR, readTrace, saveTrace } from './run-journal.ts';
import { finishTrace } from './run-trace.ts';

export const INTERRUPTED = 'Interrupted: the bot stopped while this run was going.';

// A run is written as it goes, so one the bot never finished (killed or restarted mid-run) stays
// `running` on disk and the studio shows it live for ever. At start-up no run of this process
// exists yet: every trace still `running` belongs to a process that is gone, so it is closed as failed.
// Returns the ids of the runs closed.
export async function closeInterruptedRuns(root = RUNS_DIR, at = new Date().toISOString()) {
  const closed: string[] = [];
  for (const { project, review, dir } of await reviewDirs(root)) {
    for (const id of await traceIdsIn(dir)) {
      const trace = await readTrace(project, review, id, root);
      if (trace?.outcome !== 'running') continue;
      await saveTrace(finishTrace(trace, 'failed', at, INTERRUPTED), root);
      closed.push(trace.id);
    }
  }
  if (closed.length) logger.warn({ closed }, 'Closed runs left running by a previous process');
  return closed;
}
