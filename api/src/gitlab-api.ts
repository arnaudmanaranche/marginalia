import { GITLAB_USERNAME } from './config.ts';
import { gitlabClient } from './gitlab-client.ts';
import { draftsOf } from './gitlab-draft-ops.ts';
import { mentionOpsOf } from './gitlab-mention-ops.ts';
import { readsOf } from './gitlab-reads.ts';
import { versionsOf } from './gitlab-version-ops.ts';

// What the bot asks of GitLab, by MR: the seam in front of its REST API. The REST adapter is
// built here from a client (gitlab-http.ts takes a fake `fetch`); test/support/memory-gitlab.ts
// is the in-memory one. No caller builds a URL.
export const createGitlab = (client, me) => ({ ...readsOf(client, me), ...draftsOf(client), ...versionsOf(client), ...mentionOpsOf(client) });

// The one the bot uses, bound to the configured GitLab and token.
export const gitlab = createGitlab(gitlabClient, GITLAB_USERNAME);
