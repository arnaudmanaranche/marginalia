// @ts-check
import { gitlab } from './gitlab-api.mjs';

// The threads of the MR that sit on a line of code, for the studio's diff, or with `all` every
// thread, general comments included (the ones I answer on my own MR). `outdated` is a thread
// opened on an earlier version of the MR than its head now: its line may have moved.
export async function reviewThreads(project, mr, { all = false } = {}) {
  const [threads, versions] = await Promise.all([gitlab.listDiscussions(project, mr.iid), gitlab.listMergeRequestVersions(project, mr.iid).catch(() => [])]);
  const head = versions[0]?.head_commit_sha ?? null;
  return threads.filter((t) => all || t.path).map((t) => ({ ...t, outdated: Boolean(head && t.headSha && t.headSha !== head) }));
}
