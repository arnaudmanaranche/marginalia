// Which version of the MR a review was written against, and which commits a diff of it spans.
// Pure: `versions` is GitLab's answer for /merge_requests/:iid/versions (newest first), so
// this is tested on plain fixtures.

// The version a review covered. A review keeps the head commit it was run on (`sha`); one
// written before that was recorded is matched by time instead: the newest version pushed
// before the review was written, which is `approximate`.
export function resolveReviewedVersion({ versions, sha, at }: { versions: any[], sha?: string | null, at: number }) {
  if (sha) return { sha, version: versions.find((v: any) => v.head_commit_sha === sha) ?? null, approximate: false };
  const version = Number.isFinite(at) ? versions.find((v: any) => Date.parse(v.created_at) <= at) ?? null : null;
  return { sha: version?.head_commit_sha ?? null, version, approximate: true };
}

// The two commits a review saw: its version's base and head. `{ error }` when it cannot be told.
export function diffRange({ reviewed }: { reviewed: any }) {
  if (!reviewed.version) return { error: 'The version of the code this review covered is no longer on GitLab.' };
  return { from: reviewed.version.base_commit_sha, to: reviewed.version.head_commit_sha };
}
