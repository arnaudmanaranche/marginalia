import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badge } from './badge.mjs';

test('a badge shows the full name and the team', () => {
  assert.equal(badge({ first: 'Ada', last: 'Lovelace', team: 'Engines' }), 'Ada Lovelace (Engines)');
});
