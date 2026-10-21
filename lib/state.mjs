import { readFile, writeFile, rename } from 'node:fs/promises';
import { STATE_FILE } from './config.mjs';
import { PROJECTS } from './projects.mjs';
import { migrateState, projectState } from './state-shape.mjs';

// What was reviewed, per project: see state-shape.mjs. One writer at a time: the
// poller and the studio share this process, and each save rewrites the whole file.
async function readFileState() {
  let raw = null;
  try {
    raw = JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch { /* no file yet, or unreadable: start empty */ }
  return migrateState(raw, PROJECTS[0]?.key);
}

export async function loadState(project) {
  return projectState(await readFileState(), project.key);
}

let writing = Promise.resolve();
export function saveState(project, state) {
  writing = writing.then(async () => {
    const file = await readFileState();
    file.projects[project.key] = state;
    const tmp = `${STATE_FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(file, null, 2));
    await rename(tmp, STATE_FILE);
  });
  return writing;
}
