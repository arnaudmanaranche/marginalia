// @ts-check
import { GITLAB_USERNAME } from './config.mjs';
import { gitlabClient } from './gitlab-client.mjs';
import { draftsOf } from './gitlab-draft-ops.mjs';
import { readsOf } from './gitlab-reads.mjs';
import { versionsOf } from './gitlab-version-ops.mjs';

// What the bot asks of GitLab, by MR: the seam in front of its REST API. The REST adapter is
// built here from a client (gitlab-http.mjs takes a fake `fetch`); test/support/memory-gitlab.mjs
// is the in-memory one. No caller builds a URL.
export const createGitlab = (client, me) => ({ ...readsOf(client, me), ...draftsOf(client), ...versionsOf(client) });

// The one the bot uses, bound to the configured GitLab and token.
export const gitlab = createGitlab(gitlabClient, GITLAB_USERNAME);
