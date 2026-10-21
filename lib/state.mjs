// @ts-check
import { getDb } from './store.mjs';
import { readProjectState, writeProjectState } from './db-store.mjs';

// What was reviewed, per project: { <iid>: sha, mineComments: {}, stackBelow: {} }, as it
// was in state.json. Stored in SQLite (see db-store.mjs); each save replaces one project's
// rows in a transaction, so a crash never leaves half a state.
export async function loadState(project) {
  return readProjectState(getDb(), project.key);
}

export async function saveState(project, state) {
  writeProjectState(getDb(), project.key, state);
}
