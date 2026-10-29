// @ts-check
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { STATUS_FILE } from '../lib/config.mjs';
import { PROJECTS } from '../lib/projects.mjs';
import { parseReviewId } from '../lib/review-id.mjs';
import { warn } from '../lib/log.mjs';
import { fetchReviewState } from '../lib/mr-state.mjs';

// What the route modules share: the bot's status, review-id resolution, the live-update
// channel, and the queue that keeps two writes to GitLab from racing.

export async function readStatus() {
  try {
    return JSON.parse(await readFile(STATUS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// Resolves a review id (`<project>/<slug>`): { project, slug, mr, status }, where mr is the MR
// tracked in status.json for it (undefined when none), or null for an id that is not valid.
export async function locate(id) {
  const parsed = parseReviewId(id, PROJECTS);
  if (!parsed) return null;
  const status = await readStatus();
  const mr = (status?.mrs ?? []).find((m) => m.project === parsed.project.key && m.reviewPath === join(parsed.project.reviewsDir, `${parsed.slug}.md`));
  return { ...parsed, mr, status };
}

// GitLab errors are shown to the person, but never at length.
export const shortMessage = (err) => String(err.message ?? err).slice(0, 300);

// Live updates: each open page subscribes (see routes-live.mjs); a change in a review file,
// status.json, settings.json or after an action here wakes them all, debounced.
const listeners = new Set();
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
/** @type {NodeJS.Timeout | null} */
let debounce = null;
export function broadcast() {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    for (const listener of listeners) listener();
  }, 150);
}

// One at a time, in order; a failure of one never blocks the next.
export function serialQueue() {
  let tail = Promise.resolve();
  return (task) => {
    const run = tail.then(task);
    tail = run.catch(() => {});
    return run;
  };
}
// Serialized so two quick clicks can't both pass the "already posted" check.
export const postQueue = serialQueue();

// Where an MR stands for me is read from GitLab by the poll. After an action here (a comment, a
// submitted review, a deleted draft) that one MR is read again at once, so Home moves it without
// waiting for the next poll. The newer of the two readings is the one shown.
export const stateOverrides = new Map();
export const newerState = (a, b) => (a && b ? (Date.parse(a.computedAt) >= Date.parse(b.computedAt) ? a : b) : a ?? b ?? null);
export function refreshState(project, mr, gitlab) {
  fetchReviewState(project, mr, gitlab)
    .then((state) => {
      stateOverrides.set(`${project.key}:${mr.iid}`, state);
      broadcast();
    })
    .catch((err) => warn({ ...mr, project }, `Could not refresh where it stands: ${shortMessage(err).slice(0, 120)}`));
}
