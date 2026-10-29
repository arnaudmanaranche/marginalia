// @ts-check
import { GITLAB_BASE_URL, GITLAB_TOKEN } from './config.mjs';
import { createGitlabClient } from './gitlab-http.mjs';

// The one REST client the bot uses, and the path of an MR. Internal to the gitlab*.mjs modules:
// nothing else builds a GitLab URL, it asks them (gitlab.mjs) for an operation by name.
const client = createGitlabClient({ baseUrl: GITLAB_BASE_URL, token: GITLAB_TOKEN });
export const gitlabRequest = client.request;
// Every item of a list endpoint, across pages (see gitlab-http.mjs).
export const gitlabPaginate = client.paginate;

export const mrPath = (project, iid) => `/projects/${project.encodedId}/merge_requests/${iid}`;
