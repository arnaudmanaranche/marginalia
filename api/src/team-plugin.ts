import { join } from 'node:path';

// How the team's skills, commands and agents reach `claude -p`. Pure planning: what
// to create where, and which paths the run may not edit. team-claude.ts does the I/O.
//
// The mechanism is `claude --plugin-dir <dir>`: Claude Code loads a plugin from a
// folder holding skills/, commands/ and agents/, which is exactly the team repo's
// layout. Nothing is written into the dev's repo .claude/ (the bot worktree's .claude
// is a symlink to it), and the dev's own commands keep working next to the team's.
// A plugin's commands and skills are namespaced by the plugin name: /<name>:review.
//
// The plugin dir is not the team clone itself: that would need a .claude-plugin/ folder
// inside the team repo, and the clone must stay clean for a fast-forward-only sync.
// So <dataDir>/team-plugin holds a generated manifest and symlinks into <dataDir>/team.

export const TEAM_DIRS = ['skills', 'commands', 'agents'];

// "Acme Frontend Team" -> "acme-frontend-team"; the namespace of the team's commands.
export function pluginName(teamName) {
  const slug = String(teamName ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'team';
}

// `present` is the subset of TEAM_DIRS the team repo actually has.
export function planTeamPlugin({ teamDir, pluginDir, teamName, present }) {
  return {
    manifest: {
      path: join(pluginDir, '.claude-plugin', 'plugin.json'),
      json: {
        name: pluginName(teamName),
        description: `Shared review skills of ${teamName ?? 'the team'}, synced by marginalia`,
      },
    },
    links: TEAM_DIRS.filter((d) => present.includes(d)).map((d) => ({ path: join(pluginDir, d), target: join(teamDir, d) })),
  };
}

// The headless run gets the team files read-only, like the dev's own trusted
// .claude/{commands,agents,skills,hooks}: a prompt-injected run must not rewrite
// instructions every later review of the team will follow. `//` is an absolute path.
export function teamDenyRules({ teamDir, pluginDir }) {
  return [teamDir, pluginDir].map((dir) => `Edit(/${join(dir)}/**)`);
}

// Flags and settings to add to a run; empty when no plugin dir was assembled.
export function teamRunPlan({ pluginDir, teamDir, assembled }) {
  if (!assembled) return { args: [], deny: [] };
  return { args: ['--plugin-dir', pluginDir], deny: teamDenyRules({ teamDir, pluginDir }) };
}

// Adds the team's deny rules to the settings object of a run (`claudeSettings` output).
export function withTeamDeny(settings, plan) {
  if (!plan.deny.length) return settings;
  return { ...settings, permissions: { ...settings.permissions, deny: [...new Set([...(settings.permissions?.deny ?? []), ...plan.deny])] } };
}
