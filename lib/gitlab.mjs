// @ts-check
import { excludedAuthors, staleAfterDays } from './settings.mjs';
import { gitlab } from './gitlab-api.mjs';
import { log } from './log.mjs';
import { mtimeOrNull, reviewOutputPath } from './paths.mjs';

// What the poll decides about GitLab's answers: which open MRs are worth a review, and whether a
// review file is newer than the last push. The calls themselves are gitlab-api.mjs's.

// Each MR comes back with its `project`, so what is done with it needs nothing else.
export async function listOpenMergeRequests(project) {
  const mrs = (await gitlab.openMergeRequests(project)).map((mr) => ({ ...mr, project }));
  const staleDays = staleAfterDays();
  const excluded = excludedAuthors(project);
  const staleCutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  return mrs.filter((mr) => {
    if (mr.draft) return false;
    if (excluded.has(mr.author.username.toLowerCase())) return false;
    if (new Date(mr.updated_at).getTime() < staleCutoff) {
      log({ ...mr, project }, `Skipping: no activity in the last ${staleDays} days (last update ${mr.updated_at}).`);
      return false;
    }
    return true;
  });
}

export async function reviewFileCoversLastPush(mr) {
  const mtime = await mtimeOrNull(reviewOutputPath(mr));
  if (mtime === null) return false;
  const pushedAt = await gitlab.lastPushAt(mr);
  return pushedAt !== null && mtime >= pushedAt;
}
