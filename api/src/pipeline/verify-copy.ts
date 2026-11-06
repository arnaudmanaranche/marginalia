// The disposable copy of the MR's worktree a runner mounts (ADR 0009): the files, and nothing of the
// bot's or of git: no `.git` (its config may hold a token), no `.claude`, no `.env`, no symlink (one
// could lead out of the copy). Made outside the data directory, which a runner may never mount.
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const SKIPPED = new Set(['.git', '.claude']);
// .env and .env.local hold secrets; .env.example and .env.sample are documentation.
const SECRET_ENV = /^\.env(\..+)?$/;
const DOC_ENV = /\.(example|sample|template)$/;

export const keepInCopy = (src: string) => {
  const name = basename(src);
  return !SKIPPED.has(name) && !(SECRET_ENV.test(name) && !DOC_ENV.test(name)) && !lstatSync(src).isSymbolicLink();
};

export async function copyWorktree(worktree: string) {
  const dir = await mkdtemp(join(tmpdir(), 'marginalia-verify-'));
  const copy = join(dir, 'project');
  await cp(worktree, copy, { recursive: true, filter: keepInCopy });
  return { dir: copy, remove: () => rm(dir, { recursive: true, force: true }) };
}
