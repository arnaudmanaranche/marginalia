import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluginName, planTeamPlugin, teamDenyRules, teamRunPlan, withTeamDeny } from '../lib/team-plugin.mjs';
import { teamChecks } from '../lib/team-doctor.mjs';

test('the plugin name is a slug of the team name, with a fallback', () => {
  assert.equal(pluginName('Acme Frontend Team!'), 'acme-frontend-team');
  assert.equal(pluginName('  ***  '), 'team');
  assert.equal(pluginName(undefined), 'team');
});

test('only the team folders that exist are linked, and nothing is planned inside the dev repo', () => {
  const plan = planTeamPlugin({ teamDir: '/d/team', pluginDir: '/d/team-plugin', teamName: 'Acme', present: ['skills', 'agents'] });
  assert.deepEqual(plan.links, [
    { path: '/d/team-plugin/skills', target: '/d/team/skills' },
    { path: '/d/team-plugin/agents', target: '/d/team/agents' },
  ]);
  assert.equal(plan.manifest.path, '/d/team-plugin/.claude-plugin/plugin.json');
  assert.equal(plan.manifest.json.name, 'acme');
});

test('the run may not edit the team files', () => {
  const rules = teamDenyRules({ teamDir: '/d/team', pluginDir: '/d/team-plugin' });
  assert.deepEqual(rules, ['Edit(//d/team/**)', 'Edit(//d/team-plugin/**)']);
});

test('a run gets --plugin-dir and the deny rules only when a plugin was assembled', () => {
  const paths = { teamDir: '/d/team', pluginDir: '/d/team-plugin' };
  assert.deepEqual(teamRunPlan({ ...paths, assembled: false }), { args: [], deny: [] });
  const plan = teamRunPlan({ ...paths, assembled: true });
  assert.deepEqual(plan.args, ['--plugin-dir', '/d/team-plugin']);
  const settings = { permissions: { deny: ['Edit(//x)'] }, sandbox: { enabled: true } };
  const merged = withTeamDeny(settings, plan);
  assert.equal(merged.permissions.deny.length, 3);
  assert.deepEqual(merged.sandbox, settings.sandbox);
  assert.equal(withTeamDeny(settings, { deny: [] }), settings);
});

const NOW = Date.parse('2026-10-21T12:00:00Z');
const loaded = { present: true, ok: true, team: { name: 'Acme' }, content: { skills: ['a'], commands: [], agents: [] } };
const marker = { ok: true, syncedAt: '2026-10-21T08:00:00Z' };
const base = { url: 'u', marker, loaded, behind: 0, unmapped: [], now: NOW };
const levels = (state) => teamChecks(state).map((c) => c.level);

test('doctor: no team configured is fine', () => {
  assert.deepEqual(teamChecks({ ...base, url: null }), [{ level: 'ok', message: 'No team repo configured (solo setup)' }]);
});

test('doctor: a recent clean sync with a valid team is all ok', () => {
  assert.deepEqual(levels(base), ['ok', 'ok']);
});

test('doctor: never synced, stale, failed and behind each warn with a fix', () => {
  assert.match(teamChecks({ ...base, marker: null })[0].fix, /team-sync/);
  assert.match(teamChecks({ ...base, marker: { ok: true, syncedAt: '2026-10-01T00:00:00Z' } })[0].message, /over a week/);
  const failed = teamChecks({ ...base, marker: { ...marker, ok: false, kind: 'diverged', error: 'cannot fast-forward' } });
  assert.equal(failed[0].level, 'warn');
  assert.match(failed[0].fix, /clone it again/);
  assert.match(teamChecks({ ...base, behind: 3 }).find((c) => /behind/.test(c.message)).message, /3 commits/);
});

test('doctor: too old is an error that says to update marginalia', () => {
  const tooOld = { present: true, ok: false, tooOld: true, errors: ['minMarginalia: needs 9.0.0'] };
  const checks = teamChecks({ ...base, loaded: tooOld });
  assert.equal(checks.at(-1).level, 'error');
  assert.match(checks.at(-1).fix, /update marginalia/);
});

test('doctor: invalid team.json and missing copy are errors', () => {
  assert.match(teamChecks({ ...base, loaded: { present: true, ok: false, errors: ['name: required'] } }).at(-1).message, /name: required/);
  assert.equal(teamChecks({ ...base, loaded: { present: false } }).at(-1).level, 'error');
});

test('doctor: unmapped team projects say how to map them', () => {
  const checks = teamChecks({ ...base, unmapped: [{ gitlabProjectId: 'acme/front', key: 'front' }] });
  const w = checks.find((c) => /no local checkout/.test(c.message));
  assert.equal(w.level, 'warn');
  assert.match(w.fix, /repoLocalPath/);
});
