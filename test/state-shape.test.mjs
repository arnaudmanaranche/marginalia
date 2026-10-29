import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateState, projectState, migratePosted, postedKey } from '../api/src/state-shape.mjs';

test('a single-project state file moves under the first project', () => {
  const file = migrateState({ 12: 'sha', mineComments: { 3: 't' }, stackBelow: {} }, 'back');
  assert.equal(file.version, 2);
  assert.deepEqual(Object.keys(file.projects), ['back']);
  assert.equal(file.projects.back[12], 'sha');
});

test('an empty or unreadable state migrates to no projects', () => {
  assert.deepEqual(migrateState(null, 'back').projects, {});
  assert.deepEqual(migrateState({}, 'back').projects, {});
});

test('a v2 file is kept as is, and a project without state gets empty bookkeeping', () => {
  const v2 = { version: 2, projects: { back: { 1: 'a' } } };
  assert.equal(migrateState(v2, 'back'), v2);
  assert.deepEqual(projectState(v2, 'front'), { mineComments: {}, stackBelow: {} });
});

test('posted keys from before projects get the first project, new ones are untouched', () => {
  const out = migratePosted({ 'feat-x:c1': { iid: 1 }, 'front/feat-y:c2': { iid: 2 } }, 'back');
  assert.deepEqual(Object.keys(out), ['back/feat-x:c1', 'front/feat-y:c2']);
  assert.equal(postedKey('back', 'feat-x', 'c1'), 'back/feat-x:c1');
});
