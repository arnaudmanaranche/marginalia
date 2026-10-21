// @ts-check
import { ROOT, GITLAB_BASE_URL, CLAUDE_SANDBOX, CLAUDE_ENV_PASSTHROUGH } from './config.mjs';
import { claudeEnv } from './claude-cli.mjs';
import { claudeSettings } from './claude-sandbox.mjs';

// Sandbox + deny rules for every headless run (see claude-sandbox.mjs): the
// reviews, the triage and the studio's chat all get the same confinement, around
// the repo, worktree and reviews dir of the project the run is about.
export const runSettings = (project) => claudeSettings({
  sandbox: CLAUDE_SANDBOX !== 'false',
  rootDir: ROOT,
  repoPath: project.repoPath,
  worktreeDir: project.worktreeDir,
  reviewsDir: project.reviewsDir,
  gitHost: new URL(GITLAB_BASE_URL).hostname,
});

// The environment of a headless run: secrets scrubbed (see claude-cli.mjs).
export const runEnv = () => claudeEnv(process.env, CLAUDE_ENV_PASSTHROUGH.split(/\s+/).filter(Boolean));
