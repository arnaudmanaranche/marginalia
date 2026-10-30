import { analyzeStacks } from './stack.ts';

// What one poll has to do, decided from the open MR list and the saved state.
// Pure: no GitLab call, no disk, so it is tested on plain fixtures.

// `state` is { [iid]: sha, mineComments: {}, stackBelow: {} } (see src/state.ts).
export function planMergeRequests({ openMrs, state, allowedTargets, username, triageEnabled }: any) {
  // A stacked MR targets the branch of the MR below it, so the allowed-targets
  // filter looks at the branch the whole stack is based on.
  const stacks = analyzeStacks(openMrs);
  const openByIid = new Map<any, any>(openMrs.map((mr: any) => [mr.iid, mr]));
  const allMrs = allowedTargets.length
    ? openMrs.filter((mr: any) => allowedTargets.includes(stacks.get(mr.iid)!.baseBranch))
    : openMrs;
  const stackInfo = (mr: any) => {
    const info = stacks.get(mr.iid);
    return info && info.size > 1 ? info : null;
  };
  const parentOf = (mr: any) => openByIid.get(stacks.get(mr.iid)?.parentIid) ?? null;
  // Reviewed at this commit, and the layer below hasn't moved since.
  const isCurrent = (mr: any) => state[mr.iid] === mr.sha && (parentOf(mr) === null || state.stackBelow[mr.iid] === parentOf(mr).sha);

  // MRs by someone else are reviewed, bottom layers first so a layer comes after
  // the ones it builds on; MRs I authored get their reviewer comments triaged.
  const reviewMrs = allMrs
    .filter((mr: any) => mr.author.username !== username)
    .sort((a: any, b: any) => stacks.get(a.iid)!.depth - stacks.get(b.iid)!.depth);
  const myMrs = triageEnabled ? allMrs.filter((mr: any) => mr.author.username === username) : [];
  return { stacks, stackInfo, parentOf, isCurrent, reviewMrs, myMrs };
}

// What starts a triage of my MR: a peer comment newer than the last one triaged, or a conflict with
// its target at a head the triage has not seen conflict yet (only the staged triage settles them,
// so only it passes `conflictSha`). Stored as "<peer comment at>|<conflicting head>"; a value
// stored before conflicts counted is the peer comment time alone, and reads the same.
/** @param {string | null} peerCommentAt @param {string | null} [conflictSha] */
export const triageSignal = (peerCommentAt: any, conflictSha = null) => (peerCommentAt === null && conflictSha === null ? null : `${peerCommentAt ?? ''}|${conflictSha ?? ''}`);
const signalParts = (signal: any) => {
  const [peer = '', conflict = ''] = String(signal ?? '').split('|');
  return { peer, conflict };
};
// No signal (no peer comment, no conflict): nothing to do.
export function needsTriage(state: any, mr: any, signal: any) {
  if (signal === null) return false;
  const now = signalParts(signal);
  const last = signalParts(state.mineComments[mr.iid]);
  return (now.peer !== '' && now.peer !== last.peer) || (now.conflict !== '' && now.conflict !== last.conflict);
}

// The lower layer's commit a review was made on top of; when it moves, the layer is stale.
export function recordBelow(state: any, mr: any, parent: any) {
  if (parent) state.stackBelow[mr.iid] = parent.sha;
  else delete state.stackBelow[mr.iid];
}

// Drops state for MRs no longer open (merged, closed) or no longer eligible.
export function pruneState(state: any, seenReviewIids: any, seenMineIids: any) {
  for (const iid of Object.keys(state)) {
    if (iid === 'mineComments' || iid === 'stackBelow') continue;
    if (!seenReviewIids.has(iid)) delete state[iid];
  }
  for (const iid of Object.keys(state.stackBelow)) if (!seenReviewIids.has(iid)) delete state.stackBelow[iid];
  for (const iid of Object.keys(state.mineComments)) if (!seenMineIids.has(iid)) delete state.mineComments[iid];
}
