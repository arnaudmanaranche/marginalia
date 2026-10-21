import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileExists } from './paths.mjs';
import { parseTeam } from './team-schema.mjs';
import { TeamSyncError, cloneTeam, updateTeam } from './team-git.mjs';
import { assemblePlugin, listTeamContent, teamPaths } from './team-claude.mjs';

// Keeps <dataDir>/team in step with the team repo and exposes it to the bot. Fast-forward
// only: the copy is read-only, so a failed sync always leaves the last good one in place.

// MARGINALIA_TEAM_REPO wins over `teamRepo` of config.json; null when neither is set.
export const teamRepoUrl = ({ config, env = process.env } = {}) => (env.MARGINALIA_TEAM_REPO || config?.teamRepo || '').trim() || null;

export async function readMarker(dataDir) {
  try {
    return JSON.parse(await readFile(teamPaths(dataDir).markerFile, 'utf8'));
  } catch {
    return null;
  }
}

async function writeMarker(dataDir, marker) {
  const { markerFile } = teamPaths(dataDir);
  await writeFile(`${markerFile}.tmp`, `${JSON.stringify(marker, null, 2)}\n`);
  await rename(`${markerFile}.tmp`, markerFile);
}

// The copy on disk, parsed: { present, team, errors, tooOld, content } (no network).
export async function loadTeam(dataDir, running) {
  const { teamDir } = teamPaths(dataDir);
  if (!(await fileExists(teamDir))) return { present: false };
  let raw;
  try {
    raw = JSON.parse(await readFile(`${teamDir}/team.json`, 'utf8'));
  } catch (err) {
    const missing = err.code === 'ENOENT';
    return { present: true, errors: [missing ? 'team.json is missing at the root of the team repo' : `team.json is not valid JSON: ${err.message}`] };
  }
  const parsed = parseTeam(raw, running);
  return { present: true, ...parsed, content: await listTeamContent(teamDir) };
}

// -> { status: 'cloned'|'updated'|'unchanged'|'failed', kind?, error?, before, after }.
// Never throws for an expected failure (offline, dirty, diverged); the outcome is
// recorded in team-sync.json so doctor can say when the last attempt failed.
export async function syncTeam({ dataDir, url, running, now = () => new Date() }) {
  if (!url) return { status: 'failed', kind: 'no-repo', error: 'No team repo configured: set teamRepo in config.json or MARGINALIA_TEAM_REPO.' };
  const paths = teamPaths(dataDir);
  let result;
  try {
    const moved = (await fileExists(paths.teamDir)) ? await updateTeam(url, paths.teamDir) : await cloneTeam(url, paths.teamDir);
    result = { ...moved, status: !moved.before ? 'cloned' : moved.before === moved.after ? 'unchanged' : 'updated' };
  } catch (err) {
    if (!(err instanceof TeamSyncError)) throw err;
    result = { status: 'failed', kind: err.kind, error: err.message };
  }
  if (result.status !== 'failed') {
    const loaded = await loadTeam(dataDir, running);
    // A team repo that is invalid or too new stays synced, but its skills are withdrawn from runs.
    if (loaded.ok) await assemblePlugin(paths, loaded.team.name);
    else await rm(paths.pluginDir, { recursive: true, force: true });
  }
  const prior = await readMarker(dataDir);
  await writeMarker(dataDir, {
    url,
    attemptedAt: now().toISOString(),
    ok: result.status !== 'failed',
    kind: result.kind ?? null,
    error: result.error ?? null,
    syncedAt: result.status === 'failed' ? (prior?.syncedAt ?? null) : now().toISOString(),
    head: result.after ?? prior?.head ?? null,
  });
  return result;
}
