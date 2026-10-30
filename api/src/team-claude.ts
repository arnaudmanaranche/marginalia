import { mkdir, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileExists } from './paths.ts';
import { TEAM_DIRS, planTeamPlugin, teamRunPlan } from './team-plugin.ts';

// The I/O half of team-plugin.ts: builds <dataDir>/team-plugin (a manifest and
// symlinks into the team clone) and tells a run whether to use it.

export const teamPaths = (dataDir: string) => ({
  teamDir: join(dataDir, 'team'),
  pluginDir: join(dataDir, 'team-plugin'),
  markerFile: join(dataDir, 'team-sync.json'),
});

// Each file is replaced atomically (write a temp, rename over), so a review starting
// during a sync sees the old plugin or the new one, never a gap.
export async function assemblePlugin({ teamDir, pluginDir }: { teamDir: string; pluginDir: string }, teamName: string) {
  const present: string[] = [];
  for (const d of TEAM_DIRS) if (await fileExists(join(teamDir, d))) present.push(d);
  const plan = planTeamPlugin({ teamDir, pluginDir, teamName, present });
  await mkdir(dirname(plan.manifest.path), { recursive: true });
  const tmp = `${plan.manifest.path}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(plan.manifest.json, null, 2)}\n`);
  await rename(tmp, plan.manifest.path);
  for (const { path, target } of plan.links) {
    await rm(`${path}.tmp-${process.pid}`, { force: true });
    await symlink(target, `${path}.tmp-${process.pid}`, 'dir');
    await rename(`${path}.tmp-${process.pid}`, path);
  }
  // A folder the team repo dropped must not linger as a dangling link.
  for (const d of TEAM_DIRS.filter((x) => !present.includes(x))) await rm(join(pluginDir, d), { force: true });
  return plan;
}

// What to add to a headless run: `--plugin-dir` and the deny rules, or nothing when
// the dev has no team (or none synced yet).
export async function teamRunExtras(dataDir: string) {
  const paths = teamPaths(dataDir);
  const assembled = await fileExists(join(paths.pluginDir, '.claude-plugin', 'plugin.json'));
  return teamRunPlan({ ...paths, assembled });
}

// Names of the skills (folders with a SKILL.md), commands and agents (*.md) of a team clone.
export async function listTeamContent(teamDir: string) {
  const names = async (dir: string, keep: (e: any) => boolean) => (await readdir(join(teamDir, dir), { withFileTypes: true }).catch(() => []))
    .filter(keep).map((e: any) => e.name.replace(/\.md$/, '')).sort();
  const md = (e: any) => e.isFile() && e.name.endsWith('.md');
  const skills: string[] = [];
  for (const name of await names('skills', (e: any) => e.isDirectory())) {
    if (await fileExists(join(teamDir, 'skills', name, 'SKILL.md'))) skills.push(name);
  }
  return { skills, commands: await names('commands', md), agents: await names('agents', md) };
}
