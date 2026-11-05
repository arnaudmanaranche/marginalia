import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { StoredProjectContext } from '@worldia/marginalia-contract';

// Where a project's learned context is kept, outside the reviewed repo (ADR 0006):
// <data dir>/context/<key>.draft.json from the last Understand job, and <key>.json once a person
// approved it. A new job only replaces the draft, so reviews keep the approved context meanwhile.
const dir = (dataDir: string) => join(dataDir, 'context');
export const contextPath = (dataDir: string, key: string, state: 'draft' | 'approved') => join(dir(dataDir), `${key}${state === 'draft' ? '.draft' : ''}.json`);

export async function readContext(dataDir: string, key: string, state: 'draft' | 'approved') {
  const raw = await readFile(contextPath(dataDir, key, state), 'utf8').catch(() => null);
  if (raw === null) return null;
  try {
    const parsed = StoredProjectContext.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function save(dataDir: string, stored: unknown) {
  const valid = StoredProjectContext.parse(stored);
  const path = contextPath(dataDir, valid.project, valid.state);
  await mkdir(dir(dataDir), { recursive: true });
  await writeFile(`${path}.tmp-${process.pid}`, `${JSON.stringify(valid, null, 2)}\n`);
  await rename(`${path}.tmp-${process.pid}`, path);
  return path;
}

/** @param {{ key: string, commit: string, context: unknown, now?: Date }} input */
export const saveDraft = (dataDir: string, { key, commit, context, now = new Date() }: { key: string; commit: string; context: unknown; now?: Date }) => save(dataDir, {
  project: key, commit, learnedAt: now.toISOString(), state: 'draft', approvedBy: null, approvedAt: null, context,
});

// A person approves the draft as it is: it becomes the context reviews use. Null without a draft.
export async function approveDraft(dataDir: string, key: string, by: string, now = new Date()) {
  const draft = await readContext(dataDir, key, 'draft');
  if (!draft) return null;
  const approved = { ...draft, state: 'approved' as const, approvedBy: by, approvedAt: now.toISOString() };
  await save(dataDir, approved);
  await rm(contextPath(dataDir, key, 'draft'), { force: true });
  return approved;
}
