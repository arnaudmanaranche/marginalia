import { GITLAB_BASE_URL, GITLAB_TOKEN } from './config.ts';
import { createGitlabClient } from './gitlab-http.ts';

// The one REST client the bot uses, bound to the configured GitLab and token. Only gitlab-api.ts
// builds anything from it.
export const gitlabClient = createGitlabClient({ baseUrl: GITLAB_BASE_URL, token: GITLAB_TOKEN });
