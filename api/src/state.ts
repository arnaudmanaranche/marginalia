import { getDb } from './store.ts';
import { readProjectState, writeProjectState } from './db-store.ts';

// What was reviewed, per project: { <iid>: sha, mineComments: {}, stackBelow: {} }, as it
// was in state.json. Stored in SQLite (see db-store.ts); each save replaces one project's
// rows in a transaction, so a crash never leaves half a state.
export async function loadState(project: any) {
  return readProjectState(getDb(), project.key);
}

export async function saveState(project: any, state: any) {
  writeProjectState(getDb(), project.key, state);
}

// A review that ran outside a poll (a mention) records the head it covered, as a poll would, so
// the next poll does not review the same commit again. The layer below is left as it is: a
// stacked MR whose lower layer moved is still taken again by the poll.
export async function recordReviewedHead(project: any, iid: any, sha: string) {
  const state = await loadState(project);
  (state as any)[iid] = sha;
  await saveState(project, state);
}
