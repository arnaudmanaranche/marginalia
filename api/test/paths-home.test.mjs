import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCloneRoot, resolveDataDir } from '../dist/src/paths-home.js';

const none = () => false;
const base = { home: '/home/dev', root: '/opt/marginalia', exists: none };

test('MARGINALIA_HOME wins over everything', () => {
  assert.equal(resolveDataDir({ ...base, env: { MARGINALIA_HOME: '/data', XDG_CONFIG_HOME: '/xdg' }, exists: () => true }), '/data');
});

test('a clone that already has a .env keeps its files in the install folder', () => {
  assert.equal(resolveDataDir({ ...base, env: {}, exists: (p) => p === '/opt/marginalia/.env' }), '/opt/marginalia');
});

test('a packaged install uses XDG_CONFIG_HOME, else ~/.marginalia', () => {
  assert.equal(resolveDataDir({ ...base, env: { XDG_CONFIG_HOME: '/xdg' } }), '/xdg/marginalia');
  assert.equal(resolveDataDir({ ...base, env: {} }), '/home/dev/.marginalia');
});

test('a clone whose .env sits at the repo root, above the api package, keeps its files there', () => {
  const exists = (path) => path === '/repo/.env';
  assert.equal(resolveDataDir({ env: {}, root: '/repo/api', home: '/home/u', exists }), '/repo');
  assert.equal(findCloneRoot('/repo/api', exists), '/repo');
  assert.equal(findCloneRoot('/repo/api', () => false), null);
});
