// @ts-check
import { DATA_DIR, FILE_CONFIG, BOT_WORKTREE_DIR, TEAM } from './config.mjs';
import { applyTeam } from './config-team.mjs';
import { configFromEnv } from './config-env.mjs';
import { parseConfig } from './config-schema.mjs';
import { buildProjects } from './project.mjs';

// The projects this process watches: config.json's, else the single one in .env.
// Empty (not an error) while the config is incomplete, so `doctor` can say what is missing.
const parsed = FILE_CONFIG ? { ok: true, config: FILE_CONFIG } : parseConfig(applyTeam(configFromEnv(process.env), TEAM));

export const PROJECTS = parsed.ok ? buildProjects(parsed.config, { dataDir: DATA_DIR, legacyWorktreeDir: BOT_WORKTREE_DIR }) : [];

export function projectByKey(key) {
  return PROJECTS.find((p) => p.key === key) ?? null;
}
