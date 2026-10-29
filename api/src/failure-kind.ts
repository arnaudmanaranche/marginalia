// Why a run failed, read from its error, in the words the studio shows: what happened, whether it
// passes by itself (`transient`: retried soon, no alarm), and what a person can do about it.
// Pure: tested on the messages real runs printed.

export interface Failure { kind: string; transient: boolean; title: string; advice: string }

const RULES: [RegExp, Failure][] = [
  [/ENOTFOUND|EAI_AGAIN|Could not resolve host|ECONNREFUSED|ECONNRESET|ETIMEDOUT|Connect ?Timeout|socket hang up|fetch failed|Failed to connect|Connection timed out|unable to access 'https?:/i, {
    kind: 'network', transient: true,
    title: 'GitLab could not be reached',
    advice: 'The network or the VPN was down when the bot tried. It tries again on its own in a few minutes; nothing to do unless it keeps failing.',
  }],
  [/overloaded|\b529\b|rate[ _-]?limit|\b429\b|too many requests/i, {
    kind: 'claude_busy', transient: true,
    title: 'Claude was overloaded',
    advice: 'Anthropic asked the bot to slow down. It tries again on its own in a few minutes.',
  }],
  [/not logged in|please run \/login|invalid api key|authentication_error|OAuth token (has )?expired|credit balance/i, {
    kind: 'claude_login', transient: false,
    title: 'Claude is not logged in',
    advice: 'Log in again: `docker compose run --rm marginalia claude login` (or `claude login` for a local install), then re-run.',
  }],
  [/GitLab API[^\n]*\b(401|403)\b|\b401 Unauthorized\b|\b403 Forbidden\b/i, {
    kind: 'gitlab_auth', transient: false,
    title: 'GitLab refused the token',
    advice: 'GITLAB_TOKEN expired or lacks the api scope. Create a new one in GitLab and update the configuration.',
  }],
  [/error_max_turns|max(imum)? turns/i, {
    kind: 'max_turns', transient: false,
    title: 'The agent ran out of turns',
    advice: 'The review needed more steps than allowed. The doctor can tell which step looped.',
  }],
  [/timed? ?out|SIGTERM|SIGKILL|was killed/i, {
    kind: 'timeout', transient: true,
    title: 'The run took too long and was stopped',
    advice: 'It is tried again on the next poll. If it keeps happening, the doctor can tell where the time goes.',
  }],
  [/did not produce a report|no report/i, {
    kind: 'no_report', transient: false,
    title: 'The agent wrote no report',
    advice: 'The run finished without following the output contract. The doctor can tell why.',
  }],
  [/CONFLICT|index\.lock|cannot lock ref|not a git repository|would be overwritten by (checkout|merge)|untracked working tree files/i, {
    kind: 'git', transient: false,
    title: 'The bot worktree is in a bad state',
    advice: 'Git refused to switch branches in the bot worktree. The doctor can tell which file is in the way.',
  }],
  [/^Preflight:/, {
    kind: 'preflight', transient: false,
    title: 'A check before the run failed',
    advice: 'The run stopped before any agent started: its first stage says what did not answer and why.',
  }],
];

const UNKNOWN = {
  kind: 'unknown', transient: false,
  title: 'The run failed',
  advice: 'The cause is not a known one: the doctor reads the run and the bot to find it.',
};

/** @param {string | null | undefined} message @returns {Failure} */
export function failureKind(message) {
  const text = String(message ?? '');
  for (const [re, failure] of RULES) if (re.test(text)) return failure;
  return UNKNOWN;
}

// The failures the doctor has nothing to add to: their cause is already plain (a login, a token,
// a check before the run), and so is what to do.
const PLAIN = ['claude_login', 'gitlab_auth', 'preflight'];
/** @param {Failure} failure */
export const needsDoctor = (failure) => !failure.transient && !PLAIN.includes(failure.kind);

// How soon a poll comes back after a failure that passes by itself, when the interval is longer.
export const RETRY_AFTER_MS = 5 * 60_000;
