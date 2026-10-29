// @ts-check
import { GITLAB_USERNAME } from './config.mjs';
import { startDoctor } from './doctor.mjs';
import { latestPeerCommentAt, listOpenMergeRequests, reviewFileCoversLastPush } from './gitlab.mjs';
import { jiraPriorityOf } from './jira.mjs';
import { runMrComments, runReview } from './claude-runner.mjs';
import { fetchReviewStates } from './mr-state.mjs';
import { notify } from './notify.mjs';
import { mrCommentsOutputPath, mtimeOrNull, reviewOutputPath } from './paths.mjs';
import { isStaged } from './pipeline/staged.mjs';
import { allowedTargets } from './settings.mjs';
import { loadState, saveState } from './state.mjs';
import { trackFailure } from './telemetry.mjs';

// The real collaborators of passOver() (poll-pass.mjs).
export const passDeps = {
  listOpenMergeRequests,
  latestPeerCommentAt,
  reviewFileCoversLastPush,
  fetchReviewStates,
  jiraPriorityOf,
  mtime: mtimeOrNull,
  reviewPath: reviewOutputPath,
  commentsPath: mrCommentsOutputPath,
  runReview,
  runMrComments,
  loadState,
  saveState,
  allowedTargets,
  settlesConflicts: (project) => isStaged(project.triageCommand ?? ''),
  username: GITLAB_USERNAME,
  notify,
  trackFailure,
  startDoctor,
};
