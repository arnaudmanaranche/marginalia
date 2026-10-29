import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from './config.ts';
import { runSummary } from './run-trace.ts';

// Where the runs of each review are kept, so a run can be followed while it goes and read again
// after it ended (by a person, or by the doctor when it failed): runs/<project>/<review>/ holds,
// per run, <id>.json (the trace) and <id>.stream.jsonl (what Claude printed, event by event).
export const RUNS_DIR = join(DATA_DIR, 'runs');
// The runs kept per review, newest first; older ones are deleted as new ones start.
export const KEEP_RUNS = 20;

const ID_RE = /^[\w-]+$/;
// Each write goes through its own temporary file: two writes of one file may overlap.
let writes = 0;
const tmpOf = (file) => `${file}.${process.pid}-${(writes += 1)}.tmp`;
const dirOf = (root, project, slug) => join(root, project, slug);

// A run id sorts by time and reads as one: 2026-10-28T16-05-51-598Z-review.
/** @param {string} at @param {string} kind */
export const runId = (at, kind) => `${at.replace(/[:.]/g, '-')}-${kind}`;

/** @param {{ id: string, project: string, slug: string }} trace @param {string} [root] */
export async function saveTrace(trace, root = RUNS_DIR) {
  const dir = dirOf(root, trace.project, fileSlugOf(trace.slug));
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${trace.id}.json`);
  const tmp = tmpOf(file);
  await writeFile(tmp, JSON.stringify(trace));
  await rename(tmp, file);
}

// The raw events of one run, appended as they come.
/** @param {{ id: string, project: string, slug: string }} trace @param {string} [root] */
export async function openTranscript(trace, root = RUNS_DIR) {
  const dir = dirOf(root, trace.project, fileSlugOf(trace.slug));
  await mkdir(dir, { recursive: true });
  return createWriteStream(join(dir, `${trace.id}.stream.jsonl`), { flags: 'a' });
}

// The review's file name, from its id (`<project>/<file name>`).
const fileSlugOf = (slug) => slug.slice(slug.indexOf('/') + 1);

async function ids(root, project, fileSlug) {
  try {
    return (await readdir(dirOf(root, project, fileSlug)))
      .filter((n) => n.endsWith('.json') && !/\.(doctor|fix)\.json$/.test(n))
      .map((n) => n.slice(0, -'.json'.length))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** @param {string} project @param {string} fileSlug @param {string} id @param {string} [root] */
export async function readTrace(project, fileSlug, id, root = RUNS_DIR) {
  if (!ID_RE.test(id)) return null;
  try {
    return JSON.parse(await readFile(join(dirOf(root, project, fileSlug), `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
}

// The review's runs, newest first, without their steps.
/** @param {string} project @param {string} fileSlug @param {{ limit?: number, root?: string }} [opts] */
export async function listTraces(project, fileSlug, { limit = KEEP_RUNS, root = RUNS_DIR } = {}) {
  const traces = await Promise.all((await ids(root, project, fileSlug)).slice(0, limit).map((id) => readTrace(project, fileSlug, id, root)));
  return traces.filter(Boolean).map(runSummary);
}

// The transcript of one run, for the doctor: the last `maxBytes` of it.
/** @param {string} project @param {string} fileSlug @param {string} id @param {{ maxBytes?: number, root?: string }} [opts] */
export async function readTranscript(project, fileSlug, id, { maxBytes = 200_000, root = RUNS_DIR } = {}) {
  if (!ID_RE.test(id)) return null;
  try {
    const text = await readFile(join(dirOf(root, project, fileSlug), `${id}.stream.jsonl`), 'utf8');
    return text.length > maxBytes ? text.slice(-maxBytes) : text;
  } catch {
    return null;
  }
}

// Keeps the newest `keep` runs of a review.
/** @param {string} project @param {string} fileSlug @param {{ keep?: number, root?: string }} [opts] */
export async function pruneTraces(project, fileSlug, { keep = KEEP_RUNS, root = RUNS_DIR } = {}) {
  const old = (await ids(root, project, fileSlug)).slice(keep);
  const dir = dirOf(root, project, fileSlug);
  await Promise.all(old.flatMap((id) => ['.json', '.stream.jsonl', '.doctor.json', '.fix.json'].map((ext) => rm(join(dir, `${id}${ext}`), { force: true }))));
}

// What came after a failed run, next to it: <id>.doctor.json (the diagnosis), <id>.fix.json (the
// fix the doctor prepared on a branch).
/** @param {string} project @param {string} fileSlug @param {string} id @param {'doctor' | 'fix'} part @param {object} data @param {string} [root] */
export async function saveRunPart(project, fileSlug, id, part, data, root = RUNS_DIR) {
  const dir = dirOf(root, project, fileSlug);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${id}.${part}.json`);
  const tmp = tmpOf(file);
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, file);
}

/** @param {string} project @param {string} fileSlug @param {string} id @param {'doctor' | 'fix'} part @param {string} [root] */
export async function readRunPart(project, fileSlug, id, part, root = RUNS_DIR) {
  if (!ID_RE.test(id)) return null;
  try {
    return JSON.parse(await readFile(join(dirOf(root, project, fileSlug), `${id}.${part}.json`), 'utf8'));
  } catch {
    return null;
  }
}
