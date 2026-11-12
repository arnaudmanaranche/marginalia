import { gitlab } from './gitlab-api.ts';
import { GITLAB_USERNAME } from './config.ts';
import { startDoctor } from './doctor.ts';
import { listOpenMergeRequests, reviewFacts, reviewFileCoversLastPush } from './gitlab.ts';
import { jiraPriorityOf } from './jira.ts';
import { runMrComments, runReview } from './claude-runner.ts';
import { fetchReviewStates } from './mr-state.ts';
import { notify } from './notify.ts';
import { mrCommentsOutputPath, mtimeOrNull, ownReviewOutputPath, reviewOutputPath } from './paths.ts';
import { allowedTargets, staleAfterDays } from './settings.ts';
import { loadState, saveState } from './state.ts';
import { trackFailure } from './telemetry.ts';
import { listOwnBranches } from './own-branches.ts';
import { todayBudget } from './budget-today.ts';

// The real collaborators of passOver() (poll-pass.ts).
export const passDeps = {
  listOpenMergeRequests,
  latestPeerCommentAt: gitlab.latestPeerCommentAt,
  reviewFileCoversLastPush,
  fetchReviewStates,
  jiraPriorityOf,
  mtime: mtimeOrNull,
  reviewPath: reviewOutputPath,
  commentsPath: mrCommentsOutputPath,
  ownPath: ownReviewOutputPath,
  listOwnBranches,
  runReview,
  runMrComments,
  loadState,
  saveState,
  allowedTargets,
  // The staged triage merges the target in and settles its conflicts.
  settlesConflicts: () => true,
  username: GITLAB_USERNAME,
  notify,
  trackFailure,
  startDoctor,
  budget: () => todayBudget(),
  reviewFacts,
  staleAfterDays,
};
