import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTeam } from './team-schema.ts';
import { mergeTeam } from './team-merge.ts';
import { PACKAGE_ROOT } from './package-root.ts';

// Applies the team's defaults (see team-merge.ts) while the config is read. Synchronous, like
// the rest of config loading; the async view of the same copy is loadTeam() in team-sync.ts,
// which doctor uses to say what is wrong. A team copy that is missing, invalid or needs a newer
// Marginalia is simply not applied here: the bot runs on the dev's own config.
export const RUNNING_VERSION = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;

export function readTeamSync(dataDir, running = RUNNING_VERSION) {
  try {
    const parsed = parseTeam(JSON.parse(readFileSync(join(dataDir, 'team', 'team.json'), 'utf8')), running);
    return parsed.ok ? parsed.team : null;
  } catch {
    return null;
  }
}

// The raw config with the team under it; unchanged without a team.
export const applyTeam = (raw, team, env = process.env) => (team ? mergeTeam(raw, team, { env }).config : raw);

// The two settings that live in the environment: the team's extra tools are added to the dev's,
// and the dev's REVIEW_PROMPT_EXTRA wins over the team's.
export function teamEnv(team, env = process.env) {
  if (!team) return {};
  const { globals } = mergeTeam({ projects: [] }, team, { env });
  return { CLAUDE_EXTRA_ALLOWED_TOOLS: globals.claudeExtraAllowedTools.join(' '), REVIEW_PROMPT_EXTRA: globals.reviewPromptExtra };
}
