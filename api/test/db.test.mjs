import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase, transaction } from '../src/db.mjs';
import { MIGRATIONS } from '../src/db-schema.mjs';
import { readProjectState, writeProjectState, readPosted, writePosted, insertRun, readRuns } from '../src/db-store.mjs';
import { importLegacyFiles } from '../src/db-import.mjs';

const fresh = () => openDatabase(':memory:');

test('a new database is migrated to the latest schema, and reopening changes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'marginalia-db-'));
  const file = join(dir, 'm.db');
  openDatabase(file).close();
  const again = openDatabase(file);
  assert.equal(again.prepare('PRAGMA user_version').get().user_version, MIGRATIONS.length);
});

test('a database from a newer Marginalia is refused, not downgraded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'marginalia-db-'));
  const file = join(dir, 'm.db');
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
  db.close();
  assert.throws(() => openDatabase(file), /newer Marginalia/);
});

test('a failed transaction rolls back', () => {
  const db = fresh();
  assert.throws(() => transaction(db, () => {
    db.prepare("INSERT INTO meta VALUES ('a', '1')").run();
    throw new Error('boom');
  }), /boom/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meta').get().n, 0);
});

test('state round-trips per project, including a null "review again" mark', () => {
  const db = fresh();
  writeProjectState(db, 'back', { 12: 'sha12', 13: null, mineComments: { 3: 't1' }, stackBelow: { 13: 'sha12' } });
  writeProjectState(db, 'front', { 12: 'other', mineComments: {}, stackBelow: {} });
  assert.deepEqual(readProjectState(db, 'back'), { 12: 'sha12', 13: null, mineComments: { 3: 't1' }, stackBelow: { 13: 'sha12' } });
  assert.equal(readProjectState(db, 'front')[12], 'other');
  assert.deepEqual(readProjectState(db, 'none'), { mineComments: {}, stackBelow: {} });
});

test('saving a project replaces its rows, and only its own', () => {
  const db = fresh();
  writeProjectState(db, 'back', { 1: 'a', 2: 'b', mineComments: {}, stackBelow: {} });
  writeProjectState(db, 'front', { 9: 'z', mineComments: {}, stackBelow: {} });
  writeProjectState(db, 'back', { 2: 'b2', mineComments: {}, stackBelow: {} });
  assert.deepEqual(Object.keys(readProjectState(db, 'back')).sort(), ['2', 'mineComments', 'stackBelow']);
  assert.equal(readProjectState(db, 'back')[2], 'b2');
  assert.equal(readProjectState(db, 'front')[9], 'z');
});

test('posted comments are added, changed and removed to match the object saved', () => {
  const db = fresh();
  writePosted(db, { 'back/a:1': { iid: 1, state: 'draft' }, 'back/a:2': { iid: 1 } });
  writePosted(db, { 'back/a:1': { iid: 1, state: 'published' }, 'front/b:3': { iid: 4 } });
  assert.deepEqual(readPosted(db), { 'back/a:1': { iid: 1, state: 'published' }, 'front/b:3': { iid: 4 } });
});

test('runs keep their order and fields', () => {
  const db = fresh();
  insertRun(db, { at: '2026-01-01T00:00:00Z', project: 'back', iid: 7, kind: 'review', costUsd: 0.5 });
  insertRun(db, { at: '2026-01-02T00:00:00Z', iid: 8, kind: 'chat' });
  assert.deepEqual(readRuns(db), [
    { at: '2026-01-01T00:00:00Z', project: 'back', iid: 7, kind: 'review', costUsd: 0.5 },
    { at: '2026-01-02T00:00:00Z', project: null, iid: 8, kind: 'chat' },
  ]);
});

test('the old JSON files are imported once, under the first project, and left in place', () => {
  const dir = mkdtempSync(join(tmpdir(), 'marginalia-import-'));
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ 5: 'sha5', mineComments: { 2: 't' }, stackBelow: {} }));
  writeFileSync(join(dir, 'posted.json'), JSON.stringify({ 'feat-x:c1': { iid: 5 } }));
  writeFileSync(join(dir, 'runs.jsonl'), `${JSON.stringify({ at: '2026-01-01T00:00:00Z', iid: 5, kind: 'review' })}\n{torn\n`);
  const db = fresh();
  assert.deepEqual(importLegacyFiles(db, dir, 'back'), { projects: 1, posted: 1, runs: 1 });
  assert.equal(readProjectState(db, 'back')[5], 'sha5');
  assert.deepEqual(Object.keys(readPosted(db)), ['back/feat-x:c1']);
  assert.equal(readRuns(db)[0].project, 'back');
  writeProjectState(db, 'back', { 5: 'newer', mineComments: {}, stackBelow: {} });
  assert.equal(importLegacyFiles(db, dir, 'back'), null, 'a second import never overwrites newer data');
  assert.equal(readProjectState(db, 'back')[5], 'newer');
});

test('with no old files the import still records that it ran', () => {
  const db = fresh();
  assert.deepEqual(importLegacyFiles(db, mkdtempSync(join(tmpdir(), 'marginalia-empty-')), 'back'), { projects: 0, posted: 0, runs: 0 });
  assert.equal(importLegacyFiles(db, '/nowhere', 'back'), null);
});

test('a nested transaction rolls back alone, the outer one still commits', () => {
  const db = fresh();
  transaction(db, () => {
    db.prepare("INSERT INTO meta VALUES ('kept', '1')").run();
    assert.throws(() => transaction(db, () => {
      db.prepare("INSERT INTO meta VALUES ('dropped', '1')").run();
      throw new Error('inner');
    }), /inner/);
  });
  assert.deepEqual(db.prepare('SELECT key FROM meta').all().map((r) => r.key), ['kept']);
});
