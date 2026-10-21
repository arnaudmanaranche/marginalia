// @ts-check
import { analyzeStacks } from './stack.mjs';

// What one poll has to do, decided from the open MR list and the saved state.
// Pure: no GitLab call, no disk, so it is tested on plain fixtures.

// `state` is { [iid]: sha, mineComments: {}, stackBelow: {} } (see lib/state.mjs).
export function planMergeRequests({ openMrs, state, allowedTargets, username, triageEnabled }) {
  // A stacked MR targets the branch of the MR below it, so the allowed-targets
  // filter looks at the branch the whole stack is based on.
  const stacks = analyzeStacks(openMrs);
  const openByIid = new Map(openMrs.map((mr) => [mr.iid, mr]));
  const allMrs = allowedTargets.length
    ? openMrs.filter((mr) => allowedTargets.includes(stacks.get(mr.iid).baseBranch))
    : openMrs;
  const stackInfo = (mr) => {
    const info = stacks.get(mr.iid);
    return info && info.size > 1 ? info : null;
  };
  const parentOf = (mr) => openByIid.get(stacks.get(mr.iid)?.parentIid) ?? null;
  // Reviewed at this commit, and the layer below hasn't moved since.
  const isCurrent = (mr) => state[mr.iid] === mr.sha && (parentOf(mr) === null || state.stackBelow[mr.iid] === parentOf(mr).sha);

  // MRs by someone else are reviewed, bottom layers first so a layer comes after
  // the ones it builds on; MRs I authored get their reviewer comments triaged.
  const reviewMrs = allMrs
    .filter((mr) => mr.author.username !== username)
    .sort((a, b) => stacks.get(a.iid).depth - stacks.get(b.iid).depth);
  const myMrs = triageEnabled ? allMrs.filter((mr) => mr.author.username === username) : [];
  return { stacks, stackInfo, parentOf, isCurrent, reviewMrs, myMrs };
}

// A peer comment newer than the last one triaged. No peer comment: nothing to do.
export const needsTriage = (state, mr, peerCommentAt) => peerCommentAt !== null && state.mineComments[mr.iid] !== peerCommentAt;

// The lower layer's commit a review was made on top of; when it moves, the layer is stale.
export function recordBelow(state, mr, parent) {
  if (parent) state.stackBelow[mr.iid] = parent.sha;
  else delete state.stackBelow[mr.iid];
}

// Drops state for MRs no longer open (merged, closed) or no longer eligible.
export function pruneState(state, seenReviewIids, seenMineIids) {
  for (const iid of Object.keys(state)) {
    if (iid === 'mineComments' || iid === 'stackBelow') continue;
    if (!seenReviewIids.has(iid)) delete state[iid];
  }
  for (const iid of Object.keys(state.stackBelow)) if (!seenReviewIids.has(iid)) delete state.stackBelow[iid];
  for (const iid of Object.keys(state.mineComments)) if (!seenMineIids.has(iid)) delete state.mineComments[iid];
}
