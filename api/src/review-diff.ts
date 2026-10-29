import { gitlab } from './gitlab-api.ts';
import { stat } from 'node:fs/promises';
import { artifactAt } from './artifact.ts';
import { buildShape } from './findings.ts';
import { versionTime } from './history.ts';
import { filesForPatterns, toDiffFile } from './mr-diff.ts';
import { buildPushes, isPushHead } from './mr-pushes.ts';
import { diffRange, resolveReviewedVersion } from './review-version.ts';

// The pushes a timeline shows (the newest ones), and the earlier reports it marks.
const MAX_PUSHES = 20;
const MAX_REPORTS = 10;

// The shape of a review and when it was written: the latest one, or an earlier version of it.
async function reviewSource(project, slug, versionId) {
  if (versionId) {
    const old = await artifactAt(project.reviewsDir, slug).readHistory(versionId);
    return old && { shape: old.shape ?? buildShape({ markdown: old.markdown }), at: Date.parse(versionTime(versionId)) };
  }
  const artifact = artifactAt(project.reviewsDir, slug);
  const [shape, written] = await Promise.all([artifact.readShape(), stat(artifact.markdownPath)]);
  return { shape, at: written.mtime.getTime() };
}

// The files of one tour stop, or all of them.
async function forStop(project, slug, files, stopId, shape = null) {
  if (!stopId) return files;
  const stop = ((shape ?? (await artifactAt(project.reviewsDir, slug).readShape())).tour ?? []).find((s) => s.id === stopId);
  return stop ? filesForPatterns(files, stop.files) : [];
}

// The changed files of the MR as an earlier review saw it, optionally those of one tour stop.
// `{ status, error }` when that cannot be told.
export async function reviewDiff(project, mr, slug, { versionId, stopId = null }) {
  const source = await reviewSource(project, slug, versionId);
  if (!source) return { status: 404, error: 'no such version of this review' };
  const versions = await gitlab.listMergeRequestVersions(project, mr.iid);
  const reviewed = resolveReviewedVersion({ versions, sha: source.shape.reviewedSha, at: source.at });
  const range = diffRange({ reviewed });
  if (range.error) return { status: 404, error: range.error };
  const files = (await gitlab.compareDiffs(project, range.from, range.to)).map(toDiffFile);
  return { status: 200, files: await forStop(project, slug, files, stopId, source.shape), reviewedSha: reviewed.sha, approximate: reviewed.approximate };
}

// What changed after one push (`from`, its head commit) up to the MR's head now.
export async function diffSincePush(project, mr, slug, { from, stopId = null }) {
  const versions = await gitlab.listMergeRequestVersions(project, mr.iid);
  if (!isPushHead(versions, from)) return { status: 400, error: 'not the head of one of this merge request\'s pushes' };
  const head = versions[0].head_commit_sha;
  const files = from === head ? [] : (await gitlab.compareDiffs(project, from, head)).map(toDiffFile);
  return { status: 200, files: await forStop(project, slug, files, stopId) };
}

// The commits each recent push added, with my last review on GitLab and the bot's reports marked.
export async function reviewPushes(project, mr, slug) {
  const versions = (await gitlab.listMergeRequestVersions(project, mr.iid)).slice(0, MAX_PUSHES);
  /** @type {[any, any[]][]} */
  const entries = await Promise.all(versions.map(async (v) => [v.id, (await gitlab.getMergeRequestVersion(project, mr.iid, v.id)).commits ?? []]));
  const commitsByVersion = new Map(entries);
  const artifact = artifactAt(project.reviewsDir, slug);
  const history = (await artifact.listHistory()).slice(0, MAX_REPORTS);
  const older = await Promise.all(history.map((h) => artifact.readHistory(h.id)));
  const current = await artifact.readShape();
  const reports = [{ id: null, sha: current.reviewedSha }, ...history.map((h, i) => ({ id: h.id, sha: older[i]?.shape?.reviewedSha }))];
  const myReviewAt = mr.myState?.reviewed ? mr.myState.myActivityAt : null;
  return buildPushes({ versions, commitsByVersion, myReviewAt, reports });
}
