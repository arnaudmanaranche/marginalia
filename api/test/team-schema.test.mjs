import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTeam, compareSemver, satisfiesMin } from '../src/team-schema.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/team/team.json', import.meta.url), 'utf8'));
const MIN = { version: 1, name: 'Acme' };

test('the shipped examples/team/team.json is valid', () => {
  const result = parseTeam(example, '1.0.0');
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.team.projects.length, 2);
});

test('only version and name are required; defaults and projects are filled in', () => {
  const { team } = parseTeam(MIN, '1.0.0');
  assert.deepEqual(team.defaults, {});
  assert.deepEqual(team.projects, []);
});

test('errors are path-prefixed', () => {
  const bad = { ...MIN, projects: [{ gitlabProjectId: 'a/b', kind: 'mobile' }, { key: 'Bad Key' }] };
  const { ok, errors } = parseTeam(bad, '1.0.0');
  assert.equal(ok, false);
  assert.match(errors.join('\n'), /projects\.0\.kind/);
  assert.match(errors.join('\n'), /projects\.1\.gitlabProjectId/);
  assert.match(errors.join('\n'), /projects\.1\.key/);
});

test('a typo in a field name is an error, not silently ignored', () => {
  const { ok, errors } = parseTeam({ ...MIN, defaults: { excludeAuthor: ['x'] } }, '1.0.0');
  assert.equal(ok, false);
  assert.match(errors[0], /defaults/);
});

test('local paths and secrets have no place in a project entry', () => {
  assert.equal(parseTeam({ ...MIN, projects: [{ gitlabProjectId: '1', repoLocalPath: '/x' }] }, '1.0.0').ok, false);
});

test('only version 1 is understood, a project cannot be listed twice', () => {
  assert.equal(parseTeam({ ...MIN, version: 2 }, '1.0.0').ok, false);
  const dup = { ...MIN, projects: [{ gitlabProjectId: '1' }, { gitlabProjectId: '1' }] };
  assert.match(parseTeam(dup, '1.0.0').errors.join(), /listed twice/);
});

test('semver comparison', () => {
  assert.equal(compareSemver('2.0.0', '2.0.0'), 0);
  assert.ok(compareSemver('2.1.0', '2.0.9') > 0);
  assert.ok(compareSemver('1.9.9', '2.0.0') < 0);
  assert.ok(compareSemver('1.10.0', '1.9.0') > 0, 'numeric, not lexical');
  assert.equal(compareSemver('x', '1.0.0'), null);
  assert.equal(compareSemver('v2.0.0-beta.1', '2.0.0'), 0);
});

test('minMarginalia: satisfied, too old (reported alone), or malformed', () => {
  assert.equal(satisfiesMin(undefined, '1.0.0'), true);
  assert.equal(parseTeam({ ...MIN, minMarginalia: '2.0.0' }, '2.0.0').ok, true);
  const old = parseTeam({ ...MIN, minMarginalia: '2.0.0', somethingNew: true }, '1.4.0');
  assert.equal(old.ok, false);
  assert.equal(old.tooOld, true);
  assert.equal(old.errors.length, 1);
  assert.match(old.errors[0], /needs marginalia 2\.0\.0 or newer \(this is 1\.4\.0\)/);
  assert.equal(parseTeam({ ...MIN, minMarginalia: 'soon' }, '1.0.0').ok, false);
});
