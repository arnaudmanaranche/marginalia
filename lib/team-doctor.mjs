// @ts-check
// Doctor checks for the team layer: pure, from a plain description of the team state,
// so each is tested on fixtures. The CLI's doctor prints them.
//
// state: {
//   url,               the configured team repo, or null
//   marker,            contents of team-sync.json, or null (never synced)
//   loaded,            loadTeam() result: { present, ok, team, errors, tooOld, content }
//   behind,            commits origin has that the copy lacks (as of the last fetch), or null
//   unmapped,          team projects the dev has no projects[] entry for (mergeTeam().unmapped)
//   now,               Date.now() of the check
// }
// -> [{ level: 'ok'|'warn'|'error', message, fix? }]

const STALE_AFTER_MS = 7 * 24 * 3600 * 1000;
const ok = (message) => ({ level: 'ok', message });
const warn = (message, fix) => ({ level: 'warn', message, fix });
const error = (message, fix) => ({ level: 'error', message, fix });

const FAILURE_FIX = {
  unreachable: 'check the network and your access to the team repo, then run `marginalia sync`',
  dirty: 'the team copy is read-only: discard the local changes in <dataDir>/team, then sync again',
  diverged: 'delete <dataDir>/team and run `marginalia sync` to clone it again',
  'not-a-repo': 'move <dataDir>/team away and run `marginalia sync`',
};

function syncChecks({ marker, behind, now }) {
  if (!marker) return [warn('The team repo has never been synced', 'run `marginalia sync`')];
  const out = [];
  if (!marker.ok) {
    const fix = FAILURE_FIX[marker.kind] ?? 'run `marginalia sync` and read its message';
    out.push(warn(`The last team sync failed (${marker.kind ?? 'error'}): ${marker.error}`, fix));
  }
  const synced = marker.syncedAt ? Date.parse(marker.syncedAt) : NaN;
  if (Number.isNaN(synced)) out.push(warn('No successful team sync on record', 'run `marginalia sync`'));
  else if (now - synced > STALE_AFTER_MS) out.push(warn('The team copy was last synced over a week ago', 'run `marginalia sync`'));
  else if (marker.ok) out.push(ok(`Team repo synced ${marker.syncedAt}`));
  if (behind > 0) out.push(warn(`The team copy is ${behind} commit${behind > 1 ? 's' : ''} behind origin`, 'run `marginalia sync`'));
  return out;
}

function contentChecks({ loaded, unmapped }) {
  if (!loaded.present) return [error('No team copy on disk', 'run `marginalia sync`')];
  if (loaded.tooOld) return [error(loaded.errors[0], 'update marginalia (git pull, npm run setup), then run `marginalia sync`')];
  if (!loaded.ok) return [error(`team.json is invalid: ${loaded.errors.join('; ')}`, 'ask the team to fix team.json, then sync again')];
  const { skills, commands, agents } = loaded.content;
  const out = [ok(`Team "${loaded.team.name}": ${skills.length} skills, ${commands.length} commands, ${agents.length} agents`)];
  for (const p of unmapped) {
    out.push(warn(`Team project ${p.key ?? p.gitlabProjectId} has no local checkout`, `add a projects[] entry with gitlabProjectId "${p.gitlabProjectId}" and your repoLocalPath to config.json`));
  }
  return out;
}

export function teamChecks(state) {
  if (!state.url) return [{ level: 'ok', message: 'No team repo configured (solo setup)' }];
  return [...syncChecks(state), ...contentChecks(state)];
}
