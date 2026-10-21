import { writeFile, rename } from 'node:fs/promises';
import { STATUS_FILE } from './config.mjs';
import { PROJECTS } from './projects.mjs';
import { timestamp, c } from './log.mjs';

// What the menu bar plugin shows. Kept in memory and flushed to status.json
// after every change.
export const status = {
  pid: process.pid,
  startedAt: new Date().toISOString(),
  phase: 'idle', // idle | polling | reviewing | error | stopped
  current: null, // MR being reviewed right now
  lastPoll: null, // { at, ok, error }
  nextPollAt: null,
  projects: PROJECTS.map((p) => ({ key: p.key, kind: p.kind, reviewsDir: p.reviewsDir })),
  mrs: [],
};

let statusWrite = Promise.resolve();

// Writes go through a temp file + rename so the plugin never reads a
// half-written file, and are chained so two writes never race on the rename.
export function writeStatus() {
  statusWrite = statusWrite
    .then(async () => {
      const tmp = `${STATUS_FILE}.tmp`;
      await writeFile(tmp, JSON.stringify(status, null, 2));
      await rename(tmp, STATUS_FILE);
    })
    .catch((err) => console.error(`${timestamp()} ${c.red}Could not write ${STATUS_FILE}:${c.reset}`, err));
  return statusWrite;
}

// An MR is told apart by its project: iids repeat from one GitLab project to the next.
export const sameMr = (entry, mr) => entry.iid === mr.iid && entry.project === mr.project.key;

export function setMrStatus(mr, patch) {
  const entry = status.mrs.find((m) => sameMr(m, mr));
  if (entry) Object.assign(entry, patch);
  return writeStatus();
}
