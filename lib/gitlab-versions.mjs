// @ts-check
import { gitlabPaginate, gitlabRequest, mrPath } from './gitlab.mjs';

// The versions of an MR (one per push), newest first, and the diff between two commits.
export const listMergeRequestVersions = (project, iid) => gitlabPaginate(`${mrPath(project, iid)}/versions`);

// One version with the commits it holds (`commits`, newest first).
export const getMergeRequestVersion = (project, iid, id) => gitlabRequest(`${mrPath(project, iid)}/versions/${id}`);

// `straight` compares the two trees as they are, whatever their merge base.
export async function compareDiffs(project, from, to) {
  const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&straight=true`;
  return (await gitlabRequest(`/projects/${project.encodedId}/repository/compare?${query}`)).diffs ?? [];
}
