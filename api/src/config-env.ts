// Maps the legacy .env variables to the config shape, as a single project, so an
// existing install keeps working untouched. Pure: takes the env, returns an object.
const csv = (v: unknown) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function configFromEnv(env: any) {
  const command = (value: string | undefined, fallback: any) => (value === undefined ? fallback : value.trim());
  return {
    gitlabBaseUrl: env.GITLAB_BASE_URL,
    gitlabUsername: env.GITLAB_USERNAME,
    gitlabToken: env.GITLAB_TOKEN,
    claudeBin: env.CLAUDE_BIN || undefined,
    sandbox: env.CLAUDE_SANDBOX === undefined ? undefined : env.CLAUDE_SANDBOX !== 'false',
    notifications: env.NOTIFICATIONS === undefined ? undefined : env.NOTIFICATIONS !== 'false',
    studioPort: env.STUDIO_PORT ?? env.VIEWER_PORT,
    projects: [{
      gitlabProjectId: env.GITLAB_PROJECT_ID,
      repoLocalPath: env.REPO_LOCAL_PATH || env.WEBAPP_LOCAL_PATH,
      reviewCommand: command(env.REVIEW_COMMAND, '/code-review'),
      triageCommand: command(env.TRIAGE_COMMAND, '/mr-comments'),
      allowedTargetBranches: csv(env.ALLOWED_TARGET_BRANCHES),
      excludeAuthors: csv(env.EXCLUDE_AUTHORS),
    }],
  };
}

// The reverse mapping, for a config.json: the variables the rest of the code
// still reads, taken from the first project until the poller is multi-project.
export function envFromConfig(config: any) {
  const [project] = config.projects;
  return {
    GITLAB_BASE_URL: config.gitlabBaseUrl,
    GITLAB_USERNAME: config.gitlabUsername,
    GITLAB_TOKEN: config.gitlabToken,
    CLAUDE_BIN: config.claudeBin,
    CLAUDE_SANDBOX: String(config.sandbox),
    NOTIFICATIONS: String(config.notifications),
    STUDIO_PORT: String(config.studioPort),
    GITLAB_PROJECT_ID: project.gitlabProjectId,
    REPO_LOCAL_PATH: project.repoLocalPath,
    REVIEW_COMMAND: project.reviewCommand,
    TRIAGE_COMMAND: project.triageCommand,
    ALLOWED_TARGET_BRANCHES: project.allowedTargetBranches.join(','),
    EXCLUDE_AUTHORS: project.excludeAuthors.join(','),
  };
}

// The global settings a container or a CI job sets from the outside. A config.json always has a
// value for them (the schema fills in defaults), so without this it would override the real
// environment even when the file never mentions them: `docker run -e CLAUDE_SANDBOX=false`
// would be ignored. Everything else (GitLab, projects, commands) is config.json's.
export const ENV_OVERRIDES = ['CLAUDE_BIN', 'CLAUDE_SANDBOX', 'NOTIFICATIONS', 'STUDIO_PORT'];
export const envOverrides = (env: any) => Object.fromEntries(ENV_OVERRIDES.filter((k) => env[k] !== undefined && env[k] !== '').map((k) => [k, env[k]]));
