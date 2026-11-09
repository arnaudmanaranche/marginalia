import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enterStage, finishTrace, startTrace } from '../dist/src/run-trace.js';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
const { readTrace, saveTrace } = await import('../dist/src/run-journal.js');
const { INTERRUPTED, closeInterruptedRuns } = await import('../dist/src/run-recover.js');

const trace = (id) => enterStage(startTrace({ id, slug: 'webapp/feat-x', project: 'webapp', iid: 1, kind: 'review', command: 'marginalia', at: 't0' }), 'map', 't1');

test('a run left running by a dead process is closed as failed; finished runs are left alone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runs-'));
  await saveTrace(trace('stuck'), root);
  await saveTrace(finishTrace(trace('done'), 'reviewed', 't2'), root);
  assert.deepEqual(await closeInterruptedRuns(root, 't9'), ['stuck']);
  const stuck = await readTrace('webapp', 'feat-x', 'stuck', root);
  assert.equal(stuck.outcome, 'failed');
  assert.equal(stuck.error, INTERRUPTED);
  assert.equal(stuck.endedAt, 't9');
  assert.equal(stuck.stages.find((s) => s.id === 'map').state, 'failed');
  assert.equal((await readTrace('webapp', 'feat-x', 'done', root)).outcome, 'reviewed');
  assert.deepEqual(await closeInterruptedRuns(root, 't10'), []);
});
