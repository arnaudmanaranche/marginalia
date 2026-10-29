// @ts-check
// What the preflight of a run (preflight.mjs) makes of each thing it probed, in the words the run
// shows. Pure: each reading is tested on the outputs real tools print.
//
// A check is { label, level, detail }: `ok`, `warn` (the run goes on without it, and says what it
// will miss) or `block` (the run stops here, before any agent is paid for).

/** @typedef {{ label: string, level: 'ok' | 'warn' | 'block', detail: string }} Check */

const ok = (label, detail) => /** @type {Check} */ ({ label, level: 'ok', detail });
const warn = (label, detail) => /** @type {Check} */ ({ label, level: 'warn', detail });
const block = (label, detail) => /** @type {Check} */ ({ label, level: 'block', detail });
const firstLine = (text) => String(text ?? '').trim().split('\n').find(Boolean)?.slice(0, 200) ?? '';

// `claude auth status` prints JSON. An older CLI without the command can't tell: the run goes on.
/** @param {{ stdout?: string, error?: string | null }} probe */
export function claudeCheck({ stdout = '', error = null }) {
  const label = 'Claude';
  let status = /** @type {any} */ (null);
  try {
    status = JSON.parse(stdout);
  } catch { /* not JSON: see below */ }
  if (status?.loggedIn === true) return ok(label, `logged in (${status.authMethod ?? 'unknown method'})`);
  if (status?.loggedIn === false) return block(label, 'Claude is not logged in on this machine');
  if (/ENOENT|not found/i.test(error ?? '')) return block(label, `the claude CLI is not installed or not on PATH (${firstLine(error)})`);
  return warn(label, `could not check the login (${firstLine(error) || 'unexpected answer'}): going on`);
}

// The project as the token sees it: reading it proves both the token and the access.
/** @param {{ project?: any, error?: string | null }} probe */
export function gitlabCheck({ project = null, error = null }) {
  if (project) return ok('GitLab', `the token reads ${project.path_with_namespace ?? 'the project'}`);
  // The message is kept whole: failure-kind.mjs sorts it (network, refused token).
  return block('GitLab', firstLine(error));
}

// `git ls-remote origin refs/merge-requests/<iid>/head`: the MR head the checkout fetches.
/** @param {{ stdout?: string, error?: string | null, iid: number | string }} probe */
export function branchCheck({ stdout = '', error = null, iid }) {
  if (error) return block('Git remote', `origin could not be read: ${firstLine(error)}`);
  const sha = stdout.trim().split(/\s/)[0];
  if (!sha) return block('Git remote', `origin has no head for !${iid}: the MR may be closed or its branch deleted`);
  return ok('Git remote', `!${iid} is at ${sha.slice(0, 8)} on origin`);
}

// `git push --dry-run --no-verify` (no pre-push hook runs): never sends anything, but asks origin for push access, which is what
// pushing the fixes from the studio will need. A refusal of the push itself (not a fast-forward,
// up to date) means the access is there.
/** @param {{ stdout?: string, error?: string | null, branch: string }} probe */
export function pushCheck({ stdout = '', error = null, branch }) {
  const text = `${stdout}\n${error ?? ''}`;
  if (!error || /\[rejected\]|non-fast-forward|up to date|up-to-date|fetch first/i.test(text)) return ok('Push access', `this machine can push to ${branch}`);
  if (/denied|forbidden|\b403\b|\b401\b|authentication failed|could not read username|not allowed to push|permission/i.test(text)) {
    return warn('Push access', `this machine cannot push to ${branch} (${firstLine(error)}): fixes stay in the bot's local ref, to push yourself`);
  }
  return warn('Push access', `could not check (${firstLine(error)}): going on`);
}

// The ticket the agents are given. Without it a review is still useful, so this never blocks.
/** @param {{ key: string | null, enabled: boolean, error?: string | null }} probe */
export function jiraCheck({ key, enabled, error = null }) {
  if (!key) return ok('Ticket', 'the MR names no ticket');
  if (!enabled) return warn('Ticket', `the bot has no Jira access (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN), so it cannot read ${key}: the agents go without it`);
  if (error) return warn('Ticket', `Jira refused the bot (${firstLine(error)}): the agents go without ${key}`);
  return ok('Ticket', `the bot reads ${key} in Jira`);
}

const ICON = { ok: '✓', warn: '!', block: '✗' };
/** @param {Check} c */
export const checkLine = (c) => `${ICON[c.level]} ${c.label}: ${c.detail}`;

// The error a blocked preflight stops the run with. Each blocking check's own words are kept, so
// failure-kind.mjs sorts it (a refused token, a login, the network) like any other failure.
/** @param {Check[]} checks */
export function blockedError(checks) {
  const blocked = checks.filter((c) => c.level === 'block');
  return blocked.length ? `Preflight: ${blocked.map((c) => `${c.label}: ${c.detail}`).join('; ')}` : null;
}
