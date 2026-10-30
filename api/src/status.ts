import { writeFile, rename } from 'node:fs/promises';
import { STATUS_FILE } from './config.ts';
import { PROJECTS } from './projects.ts';
import { logger } from './logger.ts';

// What the menu bar plugin shows. Kept in memory and flushed to status.json
// after every change.
export const status = {
  pid: process.pid,
  startedAt: new Date().toISOString(),
  phase: 'idle', // idle | polling | reviewing | error | stopped
  current: null as any, // MR being reviewed right now
  lastPoll: null as { at: string; ok: boolean; error: string | null } | null,
  nextPollAt: null as string | null,
  projects: PROJECTS.map((p: any) => ({ key: p.key, kind: p.kind, reviewsDir: p.reviewsDir })),
  mrs: [] as any[],
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
    .catch((err) => logger.error({ err }, `Could not write ${STATUS_FILE}`));
  return statusWrite;
}

// An MR is told apart by its project: iids repeat from one GitLab project to the next.
export const sameMr = (entry: any, mr: any) => entry.iid === mr.iid && entry.project === mr.project.key;

export function setMrStatus(mr: any, patch: any) {
  const entry = status.mrs.find((m) => sameMr(m, mr));
  if (entry) Object.assign(entry, patch);
  return writeStatus();
}

// What a pass over a project (poll-pass.ts) shows through: marks the bot busy on one MR, then
// back to polling.
export const statusSink = {
  async begin(mr: any) {
    status.phase = 'reviewing';
    status.current = { project: mr.project.key, iid: mr.iid, title: mr.title, web_url: mr.web_url, startedAt: new Date().toISOString() };
    await setMrStatus(mr, { status: 'reviewing' });
  },
  setMr: setMrStatus,
  async end() {
    status.phase = 'polling';
    status.current = null;
    await writeStatus();
  },
  entriesOf: (project: any) => status.mrs.filter((m) => m.project === project.key),
  async setEntries(project: any, entries: any[]) {
    status.mrs = [...status.mrs.filter((m) => m.project !== project.key), ...entries];
    await writeStatus();
  },
};
