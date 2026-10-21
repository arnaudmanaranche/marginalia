// @ts-check
import { GITLAB_BASE_URL, GITLAB_TOKEN, GITLAB_USERNAME } from './config.mjs';
import { excludedAuthors, staleAfterDays } from './settings.mjs';
import { createGitlabClient } from './gitlab-http.mjs';
import { findNoteIdByBody, isNotFound, latestPeerNoteAt, toDiscussions } from './gitlab-notes.mjs';
import { log } from './log.mjs';
import { mtimeOrNull, reviewOutputPath } from './paths.mjs';

// Reads of the MRs and their discussions. Draft notes (what the studio posts)
// are in gitlab-drafts.mjs, the pure readers of the API's answers in gitlab-notes.mjs.
// Every call is about one GitLab project: `project` (lib/project.mjs), or `mr.project`.

const client = createGitlabClient({ baseUrl: GITLAB_BASE_URL, token: GITLAB_TOKEN });
export const gitlabRequest = client.request;
// Every item of a list endpoint, across pages (see gitlab-http.mjs).
export const gitlabPaginate = client.paginate;

export const mrPath = (project, iid) => `/projects/${project.encodedId}/merge_requests/${iid}`;
const rawDiscussions = (project, iid) => gitlabPaginate(`${mrPath(project, iid)}/discussions`);

// The files an MR changes, each with its unified diff (across all pages).
export const listMergeRequestDiffs = (project, iid) => gitlabPaginate(`${mrPath(project, iid)}/diffs`);

// Each MR comes back with its `project`, so what is done with it needs nothing else.
export async function listOpenMergeRequests(project) {
  const mrs = (await gitlabPaginate(`/projects/${project.encodedId}/merge_requests?state=opened&order_by=updated_at&sort=desc`)).map((mr) => ({ ...mr, project }));
  const staleDays = staleAfterDays();
  const excluded = excludedAuthors(project);
  const staleCutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  return mrs.filter((mr) => {
    if (mr.draft) return false;
    if (excluded.has(mr.author.username.toLowerCase())) return false;
    if (new Date(mr.updated_at).getTime() < staleCutoff) {
      log({ ...mr, project }, `Skipping: no activity in the last ${staleDays} days (last update ${mr.updated_at}).`);
      return false;
    }
    return true;
  });
}

// The MR list's updated_at also moves on comments, so the last push time comes
// from the diff versions (newest first).
export async function lastPushAt(mr) {
  const versions = await gitlabRequest(`${mrPath(mr.project, mr.iid)}/versions?per_page=1`);
  return versions.length ? new Date(versions[0].created_at).getTime() : null;
}

export async function reviewFileCoversLastPush(mr) {
  const mtime = await mtimeOrNull(reviewOutputPath(mr));
  if (mtime === null) return false;
  const pushedAt = await lastPushAt(mr);
  return pushedAt !== null && mtime >= pushedAt;
}

// Most recent discussion note left by someone other than me, across all
// discussions on the MR. Null if no peer has commented at all — used to detect
// "new reviewer feedback to triage" on MRs I authored, the same way lastPushAt()
// detects "new commits" for MRs I'm reviewing.
export async function latestPeerCommentAt(mr) {
  return latestPeerNoteAt(await rawDiscussions(mr.project, mr.iid), GITLAB_USERNAME);
}

// The id of my published note whose text is `body` (a draft that left the
// drafts list was published, possibly from GitLab's own UI), else null.
export async function findPublishedNoteId(project, iid, body) {
  return findNoteIdByBody(await rawDiscussions(project, iid), GITLAB_USERNAME, body);
}

// False only when GitLab says the note is gone (404, i.e. deleted); any other
// failure (network, 5xx, token) throws so the caller keeps what it has.
export async function mergeRequestNoteExists(project, iid, noteId) {
  try {
    await gitlabRequest(`${mrPath(project, iid)}/notes/${noteId}`);
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

// The discussions as GitLab sends them, system notes included (the MR's real history).
export const listRawDiscussions = rawDiscussions;

// Discussion threads of an MR, human notes only, so a re-review can see what was
// answered since the last one (see toDiscussions()).
export async function listDiscussions(project, iid) {
  return toDiscussions(await rawDiscussions(project, iid), GITLAB_USERNAME);
}

// Approves the MR as the token's owner. `sha`, when given, must still be the MR's
// head or GitLab answers 409: the approval then only covers the code that was reviewed.
export async function approveMergeRequest(project, iid, sha) {
  return gitlabRequest(`${mrPath(project, iid)}/approve`, { method: 'POST', body: JSON.stringify(sha ? { sha } : {}) });
}
