import { excludedAuthors, staleAfterDays } from './settings.ts';
import { gitlab } from './gitlab-api.ts';
import { log } from './log.ts';
import { mtimeOrNull, reviewOutputPath } from './paths.ts';
import type { ReviewFacts } from './review-hold.ts';

// What the poll decides about GitLab's answers: which open MRs are worth a review, and whether a
// review file is newer than the last push. The calls themselves are gitlab-api.ts's.

// Each MR comes back with its `project`, so what is done with it needs nothing else.
export async function listOpenMergeRequests(project: any) {
  const mrs = (await gitlab.openMergeRequests(project)).map((mr: any) => ({ ...mr, project }));
  const staleDays = staleAfterDays();
  const excluded = excludedAuthors(project);
  const staleCutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  return mrs.filter((mr: any) => {
    if (mr.draft) return false;
    if (excluded.has(mr.author.username.toLowerCase())) return false;
    if (new Date(mr.updated_at).getTime() < staleCutoff) {
      log({ ...mr, project }, `Skipping: no activity in the last ${staleDays} days (last update ${mr.updated_at}).`);
      return false;
    }
    return true;
  });
}

export async function reviewFileCoversLastPush(mr: any) {
  const mtime = await mtimeOrNull(reviewOutputPath(mr));
  if (mtime === null) return false;
  const pushedAt = await gitlab.lastPushAt(mr);
  return pushedAt !== null && mtime >= pushedAt;
}

// What decides whether a poll holds an automatic review (review-hold.ts): the last push, and who
// approved the MR and when. Approvals that cannot be read count as none, so the review runs.
export async function reviewFacts(mr: any): Promise<ReviewFacts> {
  const [lastPushAt, approvals] = await Promise.all([
    gitlab.lastPushAt(mr),
    gitlab.getApprovals(mr.project, mr.iid).catch((err: any) => (log(mr, `Could not read its approvals: ${String(err.message).slice(0, 120)}`), null)),
  ]);
  const approvedBy = (approvals?.approved_by ?? []).map((a: any) => ({ username: a.user?.username ?? null, at: a.approved_at ?? null }));
  return { lastPushAt, approvedBy };
}
