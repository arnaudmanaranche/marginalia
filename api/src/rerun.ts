import { botQueue } from './bot-queue.ts';
import { branchStateKey } from './own-branches-plan.ts';

// "Review again" from the studio (GLOSSARY: Task): a task of the queue, ahead of the polls. Its
// handler (poll.ts) forgets the MR's recorded head, then passes over the project, which then takes
// the MR as new. Being a task, it never edits the state while a pass holds it in memory.

export interface RerunTarget { project: string; iid: number | string | null; kind: string; sourceBranch: string | null }

// The entry is set to null, not deleted: an absent one would let the pass trust an existing review
// file. An own review is also current through its branch (reviewed before the MR existed).
export function forget(state: any, { iid, kind, sourceBranch }: RerunTarget) {
  if (kind === 'comments') state.mineComments[iid as any] = null;
  else if (iid !== null) state[iid as any] = null;
  if (kind === 'own' && sourceBranch) state[branchStateKey(sourceBranch)] = null;
  return state;
}

export const askRerun = (target: RerunTarget) => botQueue.enqueue({
  kind: 'rerun', project: target.project, priority: 'high', payload: target,
  label: target.iid !== null ? `Review !${target.iid} again` : `Review ${target.sourceBranch ?? 'the branch'} again`,
  dedupe: `rerun:${target.project}:${target.kind}:${target.iid ?? target.sourceBranch}`,
});
