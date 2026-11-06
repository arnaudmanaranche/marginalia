import { writeFile, rename } from 'node:fs/promises';
import { STATUS_FILE } from './config.ts';
import { PROJECTS } from './projects.ts';
import { logger } from './logger.ts';
import { carryOver, readPrevious } from './status-seed.ts';

// What the menu bar plugin shows. Kept in memory and flushed to status.json
// after every change.
export const status = {
  pid: process.pid,
  startedAt: new Date().toISOString(),
  phase: 'idle', // idle | polling | reviewing | error | stopped
  current: null as any, // the MR whose review started last, of those in `running`
  running: [] as any[], // every MR being reviewed right now, one per project at most
  lastPoll: null as { at: string; ok: boolean; error: string | null } | null,
  nextPollAt: null as string | null,
  // Today's spend against the daily budget, refreshed as each task ends (poll.ts).
  budget: null as { spentUsd: number; limitUsd: number | null; over: boolean } | null,
  projects: PROJECTS.map((p: any) => ({ key: p.key, kind: p.kind, reviewsDir: p.reviewsDir })),
  // The last known entries until the first pass sets each project's own (status-seed.ts).
  mrs: carryOver(readPrevious(STATUS_FILE), PROJECTS.map((p: any) => p.key)) as any[],
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
// My own MR can have two entries (own review, triage): `kind` picks one; without it, the first.
// A branch without an MR (iid null) is told apart by its name.
export const sameMr = (entry: any, mr: any, kind?: string) => (mr.iid === null ? entry.iid === null && entry.sourceBranch === mr.source_branch : entry.iid === mr.iid)
  && entry.project === mr.project.key && (!kind || entry.kind === kind);

export function setMrStatus(mr: any, patch: any, kind?: string) {
  const entry = status.mrs.find((m) => sameMr(m, mr, kind));
  if (entry) Object.assign(entry, patch);
  return writeStatus();
}

// The phase, from what runs: reviewing while any MR is, polling while a task of the queue runs,
// otherwise idle (or error, after a failed poll). `tasks` is how many tasks of the queue run.
export function settlePhase(tasks: number) {
  if (status.phase === 'stopped') return;
  status.phase = status.running.length ? 'reviewing' : tasks > 0 ? 'polling' : status.lastPoll?.ok === false ? 'error' : 'idle';
}

// The live entry of an MR under review, for its run to write its stages into (run-tracker.ts).
export const liveEntryOf = (mr: any) => status.running.find((c) => c.project === mr.project.key && String(c.iid) === String(mr.iid)) ?? null;

// What a pass over a project (poll-pass.ts) shows through: marks the bot busy on one MR of the
// project, then not. Passes over other projects may be on theirs at the same time.
export const statusSink = {
  async begin(mr: any, kind?: string) {
    const entry = { project: mr.project.key, iid: mr.iid, title: mr.title, web_url: mr.web_url, startedAt: new Date().toISOString() };
    status.running = [...status.running.filter((c) => c.project !== entry.project), entry];
    status.current = entry;
    status.phase = 'reviewing';
    await setMrStatus(mr, { status: 'reviewing' }, kind);
  },
  setMr: setMrStatus,
  async end(mr: any) {
    status.running = status.running.filter((c) => c.project !== mr.project.key);
    status.current = status.running.at(-1) ?? null;
    if (!status.running.length) status.phase = 'polling';
    await writeStatus();
  },
  entriesOf: (project: any) => status.mrs.filter((m) => m.project === project.key),
  async setEntries(project: any, entries: any[]) {
    status.mrs = [...status.mrs.filter((m) => m.project !== project.key), ...entries];
    await writeStatus();
  },
};
