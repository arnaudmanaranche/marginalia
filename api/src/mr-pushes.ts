// The pushes of an MR as a reader follows them: what each push added, where I last reviewed it
// and where the bot did. Pure: `versions` is GitLab's /merge_requests/:iid/versions (newest
// first) and `commitsByVersion` the commits each of those versions holds, so this is tested on
// plain fixtures.

const at = (iso) => (iso ? Date.parse(iso) : NaN);

/**
 * Oldest push first: { n, headSha, baseSha, at, commits, rebased, youReviewed, reports, head }.
 * - commits:     the commits this push added ({ sha, title }), newest first. After a rebase every
 *                commit is new, so `rebased` says the list is the whole branch again.
 * - youReviewed: my last review on GitLab (`myReviewAt`) was of this push: the newest one before it.
 * - reports:     the bot's reports written on this push's head, newest first: a history version id,
 *                or null for the current report (`reports` in input, newest first, as { id, sha }).
 * `defaultFrom` is where to start reading: after the push I last reviewed, unless it is the head.
 * @param {{ versions: any[], commitsByVersion: Map<any, any[]>, myReviewAt?: string | null, reports?: { id: string | null, sha: string | null | undefined }[] }} input
 */
export function buildPushes({ versions, commitsByVersion, myReviewAt = null, reports = [] }: { versions: any[], commitsByVersion: Map<any, any[]>, myReviewAt?: string | null, reports?: { id: string | null, sha: string | null | undefined }[] }) {
  const oldestFirst = [...versions].reverse();
  const mine = Number.isFinite(at(myReviewAt)) ? oldestFirst.findLastIndex((v) => at(v.created_at) <= at(myReviewAt)) : -1;
  const pushes = oldestFirst.map((v, i) => {
    const previous = oldestFirst[i - 1];
    const before = new Set((previous ? commitsByVersion.get(previous.id) ?? [] : []).map((c) => c.id));
    const commits = (commitsByVersion.get(v.id) ?? []).filter((c) => !before.has(c.id)).map((c) => ({ sha: c.id, title: c.title ?? '' }));
    return {
      n: i + 1,
      headSha: v.head_commit_sha,
      baseSha: v.base_commit_sha,
      at: v.created_at,
      commits,
      rebased: Boolean(previous && previous.base_commit_sha !== v.base_commit_sha),
      youReviewed: i === mine,
      reports: reports.filter((r) => r.sha && r.sha === v.head_commit_sha).map((r) => r.id),
      head: i === oldestFirst.length - 1,
    };
  });
  const reviewed = pushes[mine];
  return { pushes, defaultFrom: reviewed && !reviewed.head ? reviewed.headSha : null };
}

// Whether `from` is the head of one of the MR's pushes (the only places a diff may start from).
export const isPushHead = (versions, from) => versions.some((v) => v.head_commit_sha === from);
