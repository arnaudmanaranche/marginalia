import { GITLAB_BASE_URL, GITLAB_TOKEN, GITLAB_USERNAME, STALE_AFTER_DAYS, encodedProjectId, excludedAuthors } from './config.mjs';
import { findNoteIdByBody, isNotFound, latestPeerNoteAt, toDiscussions } from './gitlab-notes.mjs';
import { c, mrTag } from './log.mjs';
import { mtimeOrNull, reviewOutputPath } from './paths.mjs';

// Reads of the MRs and their discussions. Draft notes (what the studio posts)
// are in gitlab-drafts.mjs, the pure readers of the API's answers in gitlab-notes.mjs.

export async function gitlabRequest(path, options = {}) {
  const res = await fetch(`${GITLAB_BASE_URL}/api/v4${path}`, {
    ...options,
    headers: { 'PRIVATE-TOKEN': GITLAB_TOKEN, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`GitLab API ${path} -> ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const mrPath = (iid) => `/projects/${encodedProjectId}/merge_requests/${iid}`;
const rawDiscussions = (iid) => gitlabRequest(`${mrPath(iid)}/discussions?per_page=100`);

export async function listOpenMergeRequests() {
  const mrs = await gitlabRequest(`/projects/${encodedProjectId}/merge_requests?state=opened&per_page=100&order_by=updated_at&sort=desc`);
  const staleCutoff = Date.now() - Number(STALE_AFTER_DAYS) * 24 * 60 * 60 * 1000;
  return mrs.filter((mr) => {
    if (mr.draft) return false;
    if (excludedAuthors.has(mr.author.username.toLowerCase())) return false;
    if (new Date(mr.updated_at).getTime() < staleCutoff) {
      console.log(`${c.dim}${mrTag(mr)} Skipping: no activity in the last ${STALE_AFTER_DAYS} days (last update ${mr.updated_at}).${c.reset}`);
      return false;
    }
    return true;
  });
}

// The MR list's updated_at also moves on comments, so the last push time comes
// from the diff versions (newest first).
export async function lastPushAt(mr) {
  const versions = await gitlabRequest(`${mrPath(mr.iid)}/versions?per_page=1`);
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
  return latestPeerNoteAt(await rawDiscussions(mr.iid), GITLAB_USERNAME);
}

// The id of my published note whose text is `body` (a draft that left the
// drafts list was published, possibly from GitLab's own UI), else null.
export async function findPublishedNoteId(iid, body) {
  return findNoteIdByBody(await rawDiscussions(iid), GITLAB_USERNAME, body);
}

// False only when GitLab says the note is gone (404, i.e. deleted); any other
// failure (network, 5xx, token) throws so the caller keeps what it has.
export async function mergeRequestNoteExists(iid, noteId) {
  try {
    await gitlabRequest(`${mrPath(iid)}/notes/${noteId}`);
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

// Discussion threads of an MR, so the studio can tell my comments from the
// author's replies (see toDiscussions()).
export async function listDiscussions(iid) {
  return toDiscussions(await rawDiscussions(iid), GITLAB_USERNAME);
}
