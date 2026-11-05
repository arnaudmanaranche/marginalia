import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carryOver, readPrevious } from '../dist/src/status-seed.js';

test('a restart keeps the last known MRs of watched projects, a cut-off run pending again', () => {
  const previous = { mrs: [
    { project: 'web', iid: 1, kind: 'review', status: 'up_to_date', myState: { reviewed: false } },
    { project: 'web', iid: 2, kind: 'own', status: 'reviewing' },
    { project: 'gone', iid: 3, kind: 'review', status: 'up_to_date' },
    null,
  ] };
  assert.deepEqual(carryOver(previous, ['web']).map((m) => [m.iid, m.status]), [[1, 'up_to_date'], [2, 'pending']]);
  assert.deepEqual(carryOver(previous, ['web'])[0].myState, { reviewed: false });
  assert.deepEqual(carryOver(null, ['web']), []);
  assert.deepEqual(carryOver({ mrs: 'nope' }, ['web']), []);
});

test('a missing or broken status file reads as nothing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'status-'));
  assert.equal(readPrevious(join(dir, 'none.json')), null);
  await writeFile(join(dir, 'bad.json'), '{oops');
  assert.equal(readPrevious(join(dir, 'bad.json')), null);
});
