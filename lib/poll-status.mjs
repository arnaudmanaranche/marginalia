// The status.json entries of one poll (what the studio's Home and the menu bar
// list). Pure: paths and timestamps are looked up by the caller.
const iso = (ms) => (ms === null ? null : new Date(ms).toISOString());

export function reviewEntry(mr, { plan, reviewPath, reviewedAtMs, jira, myState }) {
  const info = plan.stackInfo(mr);
  return {
    iid: mr.iid,
    title: mr.title,
    web_url: mr.web_url,
    author: mr.author.username,
    kind: 'review',
    status: plan.isCurrent(mr) ? 'up_to_date' : 'pending',
    targetBranch: mr.target_branch,
    sourceBranch: mr.source_branch,
    stack: info && { id: info.id, position: info.position, size: info.size, parentIid: info.parentIid, baseBranch: info.baseBranch },
    reviewPath,
    reviewedAt: iso(reviewedAtMs),
    error: null,
    updatedAt: mr.updated_at,
    jira,
    myState,
  };
}

export function commentsEntry(mr, { pending, reviewPath, reviewedAtMs, myState }) {
  return {
    iid: mr.iid,
    title: mr.title,
    web_url: mr.web_url,
    author: mr.author.username,
    kind: 'comments',
    status: pending ? 'pending' : 'up_to_date',
    reviewPath,
    reviewedAt: iso(reviewedAtMs),
    error: null,
    updatedAt: mr.updated_at,
    myState,
  };
}
