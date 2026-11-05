import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listJobs } from '../dist/src/job-list.js';
import { runId, saveRunPart, saveTrace } from '../dist/src/run-journal.js';
import { startTrace, finishTrace } from '../dist/src/run-trace.js';

const trace = (project, fileSlug, at, kind = 'review', iid = 1) => startTrace({ id: runId(at, kind), slug: `${project}/${fileSlug}`, project, iid, kind, command: '/code-review', at });

test('jobs of every review and project, newest first, each saying what it was', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jobs-'));
  await saveTrace(finishTrace(trace('web', 'feat-a', '2026-11-05T10:00:00.000Z'), 'reviewed', '2026-11-05T10:01:00.000Z'), root);
  await saveTrace(trace('web', 'own-feat-b', '2026-11-05T11:00:00.000Z', 'review', null), root);
  await saveTrace(finishTrace(trace('web', 'mr-comments-feat-c', '2026-11-05T09:00:00.000Z', 'triage'), 'failed', '2026-11-05T09:02:00.000Z', 'boom'), root);
  await saveTrace(trace('api', '_context', '2026-11-05T12:00:00.000Z', 'understand', null), root);
  await saveTrace(trace('hidden', 'feat-z', '2026-11-05T13:00:00.000Z'), root);
  await saveRunPart('web', 'feat-a', runId('2026-11-05T10:00:00.000Z', 'review'), 'doctor', { state: 'done' }, root);

  const jobs = await listJobs(['web', 'api'], { root, titles: new Map([['web/feat-a', 'Add coupons']]) });
  assert.deepEqual(jobs.map((j) => [j.slug, j.what, j.outcome]), [
    ['api/_context', 'understand', 'running'],
    ['web/own-feat-b', 'own', 'running'],
    ['web/feat-a', 'review', 'reviewed'],
    ['web/mr-comments-feat-c', 'comments', 'failed'],
  ]);
  assert.equal(jobs[2].title, 'Add coupons');
  assert.equal(jobs[1].iid, null);
  assert.equal(jobs[3].error, 'boom');
  assert.ok(!('steps' in jobs[0]));
  assert.equal((await listJobs(['web', 'api'], { root, limit: 2 })).length, 2);
  assert.deepEqual(await listJobs(['nothing'], { root }), []);
});
