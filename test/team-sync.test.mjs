// The team sync on real git repositories: a bare origin, a clone that stands for a team
// maintainer pushing, and a temp data dir. No network: the "remote" is a local path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rename, writeFile, lstat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { syncTeam, loadTeam, teamRepoUrl, readMarker } from '../lib/team-sync.mjs';
import { teamRunExtras, teamPaths } from '../lib/team-claude.mjs';
import { commitsBehind } from '../lib/team-git.mjs';
import teamSync from '../scripts/team-sync.mjs';

const root = await mkdtemp(join(tmpdir(), 'marginalia-team-'));
const origin = join(root, 'origin.git');
const maint = join(root, 'maintainer');
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();
const publish = (msg) => { git(maint, 'add', '-A'); git(maint, 'commit', '--quiet', '-m', msg); git(maint, 'push', '--quiet', 'origin', 'HEAD:main'); };

git(root, 'init', '--quiet', '--bare', '-b', 'main', origin);
git(root, 'clone', '--quiet', origin, maint);
await cp(new URL('../examples/team/', import.meta.url), maint, { recursive: true });
publish('team v1');

const newDataDir = () => mkdtemp(join(root, 'data-'));
const sync = (dataDir, url = origin) => syncTeam({ dataDir, url, running: '1.0.0' });

test('first sync clones, loads team.json and assembles the plugin dir', async () => {
  const dataDir = await newDataDir();
  const result = await sync(dataDir);
  assert.equal(result.status, 'cloned');
  const loaded = await loadTeam(dataDir, '1.0.0');
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.content.skills, ['pr-hygiene']);
  const { pluginDir } = teamPaths(dataDir);
  assert.equal((await lstat(join(pluginDir, 'skills'))).isSymbolicLink(), true);
  assert.equal(JSON.parse(await readFile(join(pluginDir, '.claude-plugin', 'plugin.json'), 'utf8')).name, 'acme-web');
  const extras = await teamRunExtras(dataDir);
  assert.deepEqual(extras.args, ['--plugin-dir', pluginDir]);
  assert.equal((await readMarker(dataDir)).ok, true);
  assert.deepEqual((await readdir(dataDir)).filter((f) => f.includes('.tmp')), [], 'no temp clone left behind');
});

test('a second sync with nothing new is unchanged; a push is fast-forwarded in', async () => {
  const dataDir = await newDataDir();
  await sync(dataDir);
  assert.equal((await sync(dataDir)).status, 'unchanged');
  await writeFile(join(maint, 'skills', 'pr-hygiene', 'extra.md'), 'more\n');
  publish('add extra');
  const result = await sync(dataDir);
  assert.equal(result.status, 'updated');
  assert.notEqual(result.before, result.after);
  assert.equal(await readFile(join(teamPaths(dataDir).teamDir, 'skills', 'pr-hygiene', 'extra.md'), 'utf8'), 'more\n');
});

test('unreachable origin on a first sync leaves nothing half-synced', async () => {
  const dataDir = await newDataDir();
  const result = await sync(dataDir, join(root, 'nope.git'));
  assert.equal(result.status, 'failed');
  assert.equal(result.kind, 'unreachable');
  assert.deepEqual((await readdir(dataDir)).filter((f) => f.startsWith('team') && f !== 'team-sync.json'), []);
  assert.equal((await readMarker(dataDir)).ok, false);
  assert.equal((await teamRunExtras(dataDir)).args.length, 0);
});

test('unreachable origin keeps the last copy usable, and the marker keeps the last success', async () => {
  const dataDir = await newDataDir();
  await sync(dataDir);
  const synced = (await readMarker(dataDir)).syncedAt;
  const moved = `${origin}.away`;
  await rename(origin, moved);
  try {
    const result = await sync(dataDir);
    assert.equal(result.kind, 'unreachable');
    assert.match(result.error, /keeping the last synced copy/);
    assert.equal((await loadTeam(dataDir, '1.0.0')).ok, true);
    assert.equal((await teamRunExtras(dataDir)).args.length, 2);
    const marker = await readMarker(dataDir);
    assert.deepEqual([marker.ok, marker.syncedAt], [false, synced]);
  } finally {
    await rename(moved, origin);
  }
});

test('a working copy with local changes is refused and left as it was', async () => {
  const dataDir = await newDataDir();
  await sync(dataDir);
  const file = join(teamPaths(dataDir).teamDir, 'team.json');
  await writeFile(file, '{"edited": true}');
  await writeFile(join(maint, 'NEWS.md'), 'news\n');
  publish('news');
  const result = await sync(dataDir);
  assert.equal(result.kind, 'dirty');
  assert.equal(await readFile(file, 'utf8'), '{"edited": true}');
});

test('a diverged copy (local commit, or rewritten history) is refused', async () => {
  const dataDir = await newDataDir();
  await sync(dataDir);
  const { teamDir } = teamPaths(dataDir);
  await writeFile(join(teamDir, 'local.md'), 'x\n');
  git(teamDir, 'add', '-A');
  git(teamDir, 'commit', '--quiet', '-m', 'local');
  const head = git(teamDir, 'rev-parse', 'HEAD');
  await writeFile(join(maint, 'remote.md'), 'y\n');
  publish('remote');
  const result = await sync(dataDir);
  assert.equal(result.kind, 'diverged');
  assert.equal(git(teamDir, 'rev-parse', 'HEAD'), head);
  assert.equal((await loadTeam(dataDir, '1.0.0')).ok, true);
});

test('commitsBehind counts what a fetch brought without merging', async () => {
  const dataDir = await newDataDir();
  await sync(dataDir);
  const { teamDir } = teamPaths(dataDir);
  assert.equal(await commitsBehind(teamDir), 0);
  await writeFile(join(maint, 'again.md'), 'z\n');
  publish('again');
  git(teamDir, 'fetch', '--quiet');
  assert.equal(await commitsBehind(teamDir), 1);
  await sync(dataDir);
  assert.equal(await commitsBehind(teamDir), 0);
});

test('a team repo that needs a newer marginalia is synced but withdrawn from runs', async () => {
  const dataDir = await newDataDir();
  await sync(dataDir);
  assert.equal((await teamRunExtras(dataDir)).args.length, 2);
  const team = JSON.parse(await readFile(join(maint, 'team.json'), 'utf8'));
  await writeFile(join(maint, 'team.json'), JSON.stringify({ ...team, minMarginalia: '9.0.0' }));
  publish('needs 9');
  const result = await sync(dataDir);
  assert.equal(result.status, 'updated');
  assert.equal((await loadTeam(dataDir, '1.0.0')).tooOld, true);
  assert.equal((await teamRunExtras(dataDir)).args.length, 0);
  await writeFile(join(maint, 'team.json'), JSON.stringify(team));
  publish('back to normal');
  await sync(dataDir);
  assert.equal((await teamRunExtras(dataDir)).args.length, 2);
});

test('the repo URL comes from MARGINALIA_TEAM_REPO first, then config.json', () => {
  assert.equal(teamRepoUrl({ config: { teamRepo: 'a' }, env: { MARGINALIA_TEAM_REPO: 'b' } }), 'b');
  assert.equal(teamRepoUrl({ config: { teamRepo: 'a' }, env: {} }), 'a');
  assert.equal(teamRepoUrl({ config: null, env: { MARGINALIA_TEAM_REPO: ' ' } }), null);
});

test('the script entry point: exit codes and a readable report, no stack trace', async () => {
  const dataDir = await realpath(await newDataDir());
  const lines = [];
  const log = (l) => lines.push(l);
  assert.equal(await teamSync({ dataDir, env: {}, log }), 1);
  assert.match(lines.join('\n'), /No team repo configured/);

  lines.length = 0;
  assert.equal(await teamSync({ dataDir, env: { MARGINALIA_TEAM_REPO: origin }, log }), 0);
  const report = lines.join('\n');
  assert.match(report, /Cloned: team "Acme Web"/);
  assert.match(report, /skills \(1\): pr-hygiene/);

  lines.length = 0;
  assert.equal(await teamSync({ dataDir, env: { MARGINALIA_TEAM_REPO: join(root, 'gone.git') }, log }), 1);
  assert.match(lines.join('\n'), /Team sync failed \(unreachable\)/);
  assert.doesNotMatch(lines.join('\n'), /\n\s+at /);
});
