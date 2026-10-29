// @ts-check
import { gitlab } from './gitlab-api.mjs';
import { logger } from './logger.mjs';

// The fixes the bot commits are mine and are pushed under my token, so they are committed as me:
// the GitLab user of the token, with its commit email. A GitLab push rule on committer emails
// (a company domain) refuses anything else, such as the container's default
// `marginalia@localhost`. MARGINALIA_GIT_NAME / MARGINALIA_GIT_EMAIL, when set to something of
// your own, win. Null when neither says: git's own configuration is used then.

const DEFAULT_EMAIL = 'marginalia@localhost';

/** @typedef {{ name: string, email: string }} Identity */

// Pure: the identity from the environment and GitLab's /user, in that order.
/** @param {Record<string, string | undefined>} env @param {any} user @returns {Identity | null} */
export function identityOf(env, user) {
  const email = env.MARGINALIA_GIT_EMAIL;
  if (email && email !== DEFAULT_EMAIL) return { name: env.MARGINALIA_GIT_NAME || email, email };
  const fromGitlab = user?.commit_email || user?.email || user?.public_email;
  if (fromGitlab) return { name: user.name || user.username || fromGitlab, email: fromGitlab };
  return null;
}

// The environment that makes git author and commit as `id`.
/** @param {Identity | null} id @returns {Record<string, string>} */
export const identityEnv = (id) => (id
  ? { GIT_AUTHOR_NAME: id.name, GIT_AUTHOR_EMAIL: id.email, GIT_COMMITTER_NAME: id.name, GIT_COMMITTER_EMAIL: id.email }
  : {});

/** @type {Promise<Identity | null> | null} */
let cached = null;
// Read once per process; a GitLab that can't be read now is asked again next time.
/** @returns {Promise<Identity | null>} */
export function commitIdentity() {
  cached ??= gitlab.currentUser().then((user) => identityOf(process.env, user), (err) => {
    logger.warn(`Could not read the GitLab user for the commit identity: ${err.message}`);
    cached = null;
    return identityOf(process.env, null);
  });
  return /** @type {Promise<Identity | null>} */ (cached);
}

// The environment of a git command that commits, as me.
export const commitEnv = async () => ({ ...process.env, ...identityEnv(await commitIdentity()) });
