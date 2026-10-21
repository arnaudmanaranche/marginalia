#!/usr/bin/env node
// Pulls the team repo (teamRepo of config.json, or MARGINALIA_TEAM_REPO) into
// <data dir>/team, checks its team.json and prints what changed. Fast-forward only;
// a failure keeps the last good copy. Exit code 0 when the team copy is usable and
// current, 1 otherwise.
//
//   node scripts/team-sync.mjs
//   import teamSync from './scripts/team-sync.mjs'; await teamSync({ dataDir, env, log })
import '../lib/node-check.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDataDir } from '../lib/paths-home.mjs';
import { readConfigFile } from '../lib/config-file.mjs';
import { mergeTeam } from '../lib/team-merge.mjs';
import { loadTeam, syncTeam, teamRepoUrl } from '../lib/team-sync.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const runningVersion = () => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

// A config.json that is invalid must not stop a sync (the sync may be how it gets fixed),
// but then nothing is known of the dev's projects.
function devConfig(dataDir) {
  try {
    return readConfigFile(dataDir);
  } catch {
    return null;
  }
}

function describe(result, loaded, unmapped, log) {
  const { team, content } = loaded;
  const head = { cloned: 'Cloned', updated: 'Updated', unchanged: 'Already up to date' }[result.status];
  log(`${head}: team "${team.name}" (version ${team.version}${team.minMarginalia ? `, needs marginalia ${team.minMarginalia}+` : ''})`);
  log(`  skills (${content.skills.length}): ${content.skills.join(', ') || 'none'}`);
  log(`  commands (${content.commands.length}): ${content.commands.join(', ') || 'none'}   agents (${content.agents.length}): ${content.agents.join(', ') || 'none'}`);
  if (unmapped.length) {
    log('\nTeam projects with no local checkout (add a projects[] entry with your repoLocalPath):');
    for (const p of unmapped) log(`  - ${p.key ?? p.gitlabProjectId}  (gitlabProjectId "${p.gitlabProjectId}")`);
  }
}

export default async function teamSync({ dataDir, env = process.env, log = console.log, now } = {}) {
  const dir = dataDir ?? resolveDataDir({ env, root: ROOT });
  const config = devConfig(dir);
  const url = teamRepoUrl({ config, env });
  if (!url) {
    log('No team repo configured. Set "teamRepo" in config.json (or MARGINALIA_TEAM_REPO) to the clone URL of your team repo.');
    return 1;
  }
  log(`Syncing ${url} ...`);
  const result = await syncTeam({ dataDir: dir, url, running: runningVersion(), now });
  if (result.status === 'failed') {
    log(`Team sync failed (${result.kind}): ${result.error}`);
    const kept = (await loadTeam(dir, runningVersion())).present;
    if (kept) log('The last synced copy stays in use.');
    return 1;
  }
  const loaded = await loadTeam(dir, runningVersion());
  if (!loaded.ok) {
    log(`Synced, but the team repo cannot be used: ${loaded.errors.join('\n  ')}`);
    if (loaded.tooOld) log('Update marginalia, then run the sync again. The team skills are not used until then.');
    return 1;
  }
  const raw = config ? { projects: config.projects } : { projects: [] };
  describe(result, loaded, mergeTeam(raw, loaded.team).unmapped, log);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await teamSync();
}
