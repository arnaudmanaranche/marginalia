// @ts-check
import './env-load.mjs';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDataDir } from './paths-home.mjs';
import { readConfigFile } from './config-file.mjs';
import { envFromConfig, envOverrides } from './config-env.mjs';
import { readTeamSync, teamEnv } from './config-team.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Where the bot keeps its own files (see lib/paths-home.mjs): the install folder
// for an existing clone, ~/.marginalia for a packaged install.
export const DATA_DIR = resolveDataDir({ root: ROOT });
// The validated config.json of the data dir, or null (then .env is the config).
// The team's shared defaults (lib/team-merge.mjs) when a valid team copy has been synced.
export const TEAM = readTeamSync(DATA_DIR);
export const FILE_CONFIG = readConfigFile(DATA_DIR, { team: TEAM });
export const ensureDataDir = () => mkdirSync(DATA_DIR, { recursive: true });
export const STATE_FILE = join(DATA_DIR, 'state.json');
// Live status for the SwiftBar menu bar plugin (swiftbar/menubar.mjs).
export const STATUS_FILE = join(DATA_DIR, 'status.json');
// Settings changed at runtime from the studio (see lib/settings.mjs).
export const SETTINGS_FILE = process.env.SETTINGS_FILE || join(DATA_DIR, 'settings.json');
// Comments posted to GitLab from the studio (lib/posted.mjs).
export const POSTED_FILE = join(DATA_DIR, 'posted.json');

// core.hooksPath=.husky is shared with the real checkout, but `git clean -fdx`
// wipes the generated .husky/_/husky.sh from the bot worktree, so every hook
// (post-checkout on each MR checkout) would fail. Hooks are pointless here:
// disable them for every git call this process and its children (claude, and
// the nested worktrees it creates) make, without touching the repo's config.
{
  const n = Number(process.env.GIT_CONFIG_COUNT || 0);
  process.env[`GIT_CONFIG_KEY_${n}`] = 'core.hooksPath';
  process.env[`GIT_CONFIG_VALUE_${n}`] = '/dev/null';
  process.env.GIT_CONFIG_COUNT = String(n + 1);
}

export const {
  GITLAB_BASE_URL: RAW_GITLAB_BASE_URL,
  GITLAB_TOKEN,
  GITLAB_PROJECT_ID, // numeric id, or "group/subgroup/project" path
  // Your own GitLab username. MRs authored by you are routed to
  // /mr-comments (triage reviewer comments) instead of /code-review.
  GITLAB_USERNAME,
  CLAUDE_BIN = 'claude',
  // Used to open a review file when its "ready" notification is clicked, and
  // by the SwiftBar menu's "Open review" entry.
  VSCODE_BIN = 'code',
  // The four below are only defaults: settings.json (the studio's Settings page) wins.
  ALLOWED_TARGET_BRANCHES = '',
  EXCLUDE_AUTHORS = '',
  POLL_INTERVAL_MINUTES = '5',
  // MRs with no activity (push, comment, ...) in this many days are assumed
  // stale/abandoned and skipped, so we don't waste time reviewing something
  // that's likely out of date with develop already.
  STALE_AFTER_DAYS = '14',
  // Your real local checkout of the webapp repo: the one with .claude/commands,
  // .claude/agents, .claude/settings.json and the GitLab/Atlassian connectors
  // already authorized. .claude/ is gitignored, so it only exists here, never
  // in a fresh clone or worktree.
  REPO_LOCAL_PATH: RAW_REPO_LOCAL_PATH,
  // Legacy name of REPO_LOCAL_PATH, still read so existing .env files keep working.
  WEBAPP_LOCAL_PATH: LEGACY_REPO_LOCAL_PATH,
  // Slash commands the bot runs headless. Defaults match the original setup;
  // point them at your own. An empty TRIAGE_COMMAND disables the triage of your
  // own MRs (they are then ignored).
  REVIEW_COMMAND: RAW_REVIEW_COMMAND,
  TRIAGE_COMMAND: RAW_TRIAGE_COMMAND,
  // Space-separated tools added to the built-in allow-lists (e.g. your own MCP tools).
  CLAUDE_EXTRA_ALLOWED_TOOLS = '',
  // Runs are sandboxed by default (Bash confined to the worktree, no network but
  // the GitLab host, no secrets dirs). "false" turns the sandbox off; the
  // Read/Edit deny rules stay on either way.
  CLAUDE_SANDBOX = 'true',
  // Space-separated env var names that look like secrets but a command needs
  // (the run otherwise gets no *TOKEN*, *SECRET*, *PASSWORD*, *API_KEY* variable).
  CLAUDE_ENV_PASSTHROUGH = '',
  // Free text appended to the output contract injected into every run.
  REVIEW_PROMPT_EXTRA = '',
  // A worktree of REPO_LOCAL_PATH dedicated to this bot, so reviewing MRs
  // never touches whatever branch you have checked out for your own work.
  // Created automatically on first run if missing.
  BOT_WORKTREE_DIR: RAW_BOT_WORKTREE_DIR,
  // macOS notifications when a review finishes/fails or a poll errors out.
  NOTIFICATIONS = 'true',
  // Port of the local review reader (studio/server.mjs), bound to 127.0.0.1.
  STUDIO_PORT = process.env.VIEWER_PORT ?? '4477', // VIEWER_PORT: legacy name
  // The studio has no login: it listens on loopback only. A container has to listen on 0.0.0.0
  // inside (the host publishes the port on 127.0.0.1); STUDIO_ALLOWED_HOSTS lists the extra Host
  // values it then accepts, comma-separated (e.g. localhost:8080 when the host port differs).
  STUDIO_HOST = '127.0.0.1',
  STUDIO_ALLOWED_HOSTS = '',
  // Lets the studio post review comments on other people's MRs (with your
  // GITLAB_TOKEN, so as you). Off by default. On your own MRs, replying to the
  // reviewers and pushing the triage's fixes need no switch: each still waits
  // for your click and a confirmation.
  ALLOW_POSTING = 'false',
  // "branch" (default): the bot checks out the MR's branch, and skips the MR
  // while that branch is checked out in another worktree. "detached": it checks
  // out the MR's head without any local branch, so a branch open in your own
  // worktree never blocks it and no local branch is ever moved.
  BOT_CHECKOUT = 'branch',
  // Optional: JIRA_BASE_URL alone links the ticket in the studio's side panel;
  // with all three set, the studio also lists reviews by the Jira priority of
  // the ticket named in the MR, most urgent first.
  JIRA_BASE_URL = '',
  JIRA_EMAIL = '',
  JIRA_API_TOKEN = '',
} = /** @type {Record<string, any>} */ ({ ...process.env, ...(FILE_CONFIG ? { ...envFromConfig(FILE_CONFIG), ...envOverrides(process.env) } : {}), ...teamEnv(TEAM) }); // a config.json wins over .env

export const BOT_WORKTREE_DIR = RAW_BOT_WORKTREE_DIR || join(DATA_DIR, 'worktree');
export const REPO_LOCAL_PATH = RAW_REPO_LOCAL_PATH || LEGACY_REPO_LOCAL_PATH;
export const GITLAB_BASE_URL = (RAW_GITLAB_BASE_URL ?? '').replace(/\/+$/, '');
export const REVIEW_COMMAND = RAW_REVIEW_COMMAND === undefined ? '/code-review' : RAW_REVIEW_COMMAND.trim();
export const TRIAGE_COMMAND = RAW_TRIAGE_COMMAND === undefined ? '/mr-comments' : RAW_TRIAGE_COMMAND.trim();

// Reported together so a fresh install sees everything to fix at once.
export function missingConfig() {
  const required = {
    GITLAB_BASE_URL,
    GITLAB_PROJECT_ID,
    GITLAB_TOKEN,
    GITLAB_USERNAME,
    REPO_LOCAL_PATH,
  };
  return Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
}
if (!process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK) {
  const missing = missingConfig();
  if (missing.length) {
    throw new Error(`Missing in .env: ${missing.join(', ')}. Run \`npm run init\` (interactive setup), or copy .env.example to .env and fill it in.`);
  }
}

export const encodedProjectId = /^\d+$/.test(GITLAB_PROJECT_ID)
  ? GITLAB_PROJECT_ID
  : encodeURIComponent(GITLAB_PROJECT_ID);
export const REVIEWS_DIR = join(REPO_LOCAL_PATH ?? ROOT, '.claude', 'reviews');
