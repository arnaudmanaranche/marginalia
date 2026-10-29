import { gitlab } from './gitlab-api.ts';
import { GITLAB_USERNAME } from './config.ts';
import { startDoctor } from './doctor.ts';
import { listOpenMergeRequests, reviewFileCoversLastPush } from './gitlab.ts';
import { jiraPriorityOf } from './jira.ts';
import { runMrComments, runReview } from './claude-runner.ts';
import { fetchReviewStates } from './mr-state.ts';
import { notify } from './notify.ts';
import { mrCommentsOutputPath, mtimeOrNull, reviewOutputPath } from './paths.ts';
import { isStaged } from './pipeline/staged.ts';
import { allowedTargets } from './settings.ts';
import { loadState, saveState } from './state.ts';
import { trackFailure } from './telemetry.ts';

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
