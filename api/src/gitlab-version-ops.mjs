// @ts-check
import { mrPath } from './gitlab-http.mjs';

// The versions of an MR (one per push), newest first, and the diff between two commits.
// `client` is a GitLab REST client (gitlab-http.mjs).
export const versionsOf = (client) => ({
  listMergeRequestVersions: (project, iid) => client.paginate(`${mrPath(project, iid)}/versions`),
  // One version with the commits it holds (`commits`, newest first).
  getMergeRequestVersion: (project, iid, id) => client.request(`${mrPath(project, iid)}/versions/${id}`),
  // `straight` compares the two trees as they are, whatever their merge base.
  async compareDiffs(project, from, to) {
    const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&straight=true`;
    return (await client.request(`/projects/${project.encodedId}/repository/compare?${query}`)).diffs ?? [];
  },
});
