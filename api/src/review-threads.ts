import { gitlab } from './gitlab-api.ts';

// The threads of the MR that sit on a line of code, for the studio's diff, or with `all` every
// thread, general comments included (the ones I answer on my own MR). `outdated` is a thread
// opened on an earlier version of the MR than its head now: its line may have moved.
export async function reviewThreads(project: any, mr: any, { all = false } = {}) {
  const [threads, versions] = await Promise.all([gitlab.listDiscussions(project, mr.iid), gitlab.listMergeRequestVersions(project, mr.iid).catch(() => [])]);
  const head = versions[0]?.head_commit_sha ?? null;
  return threads.filter((t: any) => all || t.path).map((t: any) => ({ ...t, outdated: Boolean(head && t.headSha && t.headSha !== head) }));
}
