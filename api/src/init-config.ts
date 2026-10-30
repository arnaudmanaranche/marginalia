import { configFromEnv } from './config-env.ts';
import { parseConfig } from './config-schema.ts';

// Pure mapping between what `marginalia init` / `migrate` read or ask and the
// config.json shape. No prompt, disk or network here, so it is tested on plain objects.

export const parseEnv = (text: string) => Object.fromEntries(
  text.split('\n').map((l: string) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m: any) => [m[1], m[2]]),
);

const csv = (v: unknown) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// One project entry from the answers of the prompts. Empty answers are left out
// (the schema's defaults apply), except the triage command, where empty means "off".
export function projectFromAnswers(a: any) {
  const entry: Record<string, any> = {
    gitlabProjectId: String(a.gitlabProjectId ?? '').trim(),
    repoLocalPath: String(a.repoLocalPath ?? '').trim(),
  };
  if (a.key) entry.key = a.key;
  if (a.kind === 'back' || a.kind === 'front') entry.kind = a.kind;
  if (a.reviewCommand?.trim()) entry.reviewCommand = a.reviewCommand.trim();
  if (a.triageCommand !== undefined) entry.triageCommand = a.triageCommand.trim();
  const branches = Array.isArray(a.allowedTargetBranches) ? a.allowedTargetBranches : csv(a.allowedTargetBranches);
  if (branches.length) entry.allowedTargetBranches = branches;
  const authors = Array.isArray(a.excludeAuthors) ? a.excludeAuthors : csv(a.excludeAuthors);
  if (authors.length) entry.excludeAuthors = authors;
  return entry;
}

// The validated config for `config.json`: shared settings from `shared`, and the
// projects. Keeps what an existing file says (`previous`) for the keys init doesn't ask.
export function buildConfig({ shared, projects, previous = {} }: { shared: any; projects: any; previous?: Record<string, any> }) {
  const raw = {
    ...previous,
    gitlabBaseUrl: shared.gitlabBaseUrl,
    gitlabUsername: shared.gitlabUsername,
    gitlabToken: shared.gitlabToken,
    ...(shared.claudeBin && shared.claudeBin !== 'claude' ? { claudeBin: shared.claudeBin } : {}),
    projects,
  };
  const result = parseConfig(raw);
  return result.ok ? { ok: true as const, raw } : result;
}

// The defaults the prompts start from: an existing .env (legacy single project) or
// config.json. Never throws on a missing key.
export function defaultsFromEnv(env: Record<string, any> = {}) {
  const c = configFromEnv(env);
  const [p] = c.projects;
  return {
    gitlabBaseUrl: c.gitlabBaseUrl,
    gitlabUsername: c.gitlabUsername,
    gitlabToken: String(c.gitlabToken ?? '').startsWith('glpat-x') ? undefined : c.gitlabToken,
    claudeBin: c.claudeBin,
    project: { ...p, allowedTargetBranches: p.allowedTargetBranches.join(',') },
  };
}

// .env variables a config.json does not carry: they are still read from the
// environment, so `migrate` tells the user to keep the .env.
export const ENV_ONLY = [
  'BOT_WORKTREE_DIR', 'POLL_INTERVAL_MINUTES', 'STALE_AFTER_DAYS', 'VSCODE_BIN', 'ALLOW_POSTING',
  'BOT_CHECKOUT', 'JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'CLAUDE_EXTRA_ALLOWED_TOOLS',
  'CLAUDE_ENV_PASSTHROUGH', 'REVIEW_PROMPT_EXTRA',
];

// `migrate`: the single-project config.json that does what the .env does today.
export function migrateEnv(env: Record<string, any>) {
  const raw = JSON.parse(JSON.stringify(configFromEnv(env))); // drops the undefined keys
  const result = parseConfig(raw);
  if (!result.ok) return { ok: false as const, errors: result.errors };
  return { ok: true as const, raw, stillInEnv: ENV_ONLY.filter((k) => env[k]) };
}
