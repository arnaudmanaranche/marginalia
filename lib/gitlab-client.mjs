// @ts-check
import { GITLAB_BASE_URL, GITLAB_TOKEN } from './config.mjs';
import { createGitlabClient } from './gitlab-http.mjs';

// The one REST client the bot uses, bound to the configured GitLab and token. Only gitlab-api.mjs
// builds anything from it.
export const gitlabClient = createGitlabClient({ baseUrl: GITLAB_BASE_URL, token: GITLAB_TOKEN });
