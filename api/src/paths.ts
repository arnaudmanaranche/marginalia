import { access, stat } from 'node:fs/promises';
import { join } from 'node:path';

export function branchSlug(branch: string) {
  return branch.replace(/\//g, '-');
}

// Where a review is written: the reviews dir of the MR's project.
export function reviewOutputPath(mr: any) {
  return join(mr.project.reviewsDir, `${branchSlug(mr.source_branch)}.md`);
}

export const TRIAGE_FILE_PREFIX = 'mr-comments-';

export function mrCommentsOutputPath(mr: any) {
  return join(mr.project.reviewsDir, `${TRIAGE_FILE_PREFIX}${branchSlug(mr.source_branch)}.md`);
}

// A local-only branch ref (never pushed) recording where /mr-comments' fixes
// for this MR ended up. The bot worktree shares its object database and refs
// with REPO_LOCAL_PATH (it's a `git worktree` of it), so this ref is
// immediately visible from your real checkout too — `git log
// marginalia/<slug>` or `git cherry-pick` from there — and survives the
// `git clean -fdx` + `reset --hard` the *next* checkoutMergeRequest() call
// does on the bot worktree's working copy, since that only touches the
// working tree and mr.source_branch, not this separate ref.
export function fixesRef(mr: any) {
  return `marginalia/${branchSlug(mr.source_branch)}`;
}

export async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function mtimeOrNull(path: string) {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}
