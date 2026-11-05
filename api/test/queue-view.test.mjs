import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueView } from '../dist/src/queue-view.js';

const task = (over) => ({ id: 'x', kind: 'poll', project: null, label: 'Poll', priority: 'normal', status: 'queued', payload: {}, dedupe: null, enqueuedAt: '2026-11-05T10:00:00Z', startedAt: null, endedAt: null, attempt: 1, error: null, ...over });
const job = (over) => ({ slug: 'app/review-1', id: 'r', outcome: 'reviewed', title: 'Fix login', startedAt: '2026-11-05T10:02:00Z', endedAt: '2026-11-05T10:05:00Z', cost: { usd: 0.4 }, ...over });

test('a task carries the jobs that began while it ran, and the running one says what it is on', () => {
  const view = queueView({
    tasks: [
      task({ id: 'run', status: 'running', startedAt: '2026-11-05T10:01:00Z' }),
      task({ id: 'wait', kind: 'mention', priority: 'high', enqueuedAt: '2026-11-05T10:03:00Z' }),
      task({ id: 'old', status: 'done', startedAt: '2026-11-05T09:00:00Z', endedAt: '2026-11-05T09:10:00Z' }),
    ],
    jobs: [job({ id: 'in' }), job({ id: 'before', startedAt: '2026-11-05T09:30:00Z' }), job({ id: 'earlier', startedAt: '2026-11-05T09:05:00Z', cost: null })],
    totals: { done: 1, failed: 0 },
    now: '2026-11-05T10:06:00Z',
    workers: 2,
    live: [{ project: 'other', iid: 9, title: 'Elsewhere' }, { project: null, iid: 1, title: 'Fix login' }].map((l) => ({ ...l, project: l.project ?? undefined })),
  });
  const byId = Object.fromEntries(view.tasks.map((t) => [t.id, t]));
  assert.deepEqual(byId.run.jobs.map((j) => j.id), ['in']);
  assert.equal(byId.run.jobs[0].costUsd, 0.4);
  assert.equal(byId.run.detail, '!1 Fix login');
  assert.deepEqual(byId.old.jobs.map((j) => [j.id, j.costUsd]), [['earlier', null]]);
  assert.equal(byId.wait.position, 1);
  assert.equal(byId.run.position, null);
  assert.deepEqual(view.workers, [
    { id: 'w1', name: 'Worker 1', detail: '!1 Fix login', taskId: 'run' },
    { id: 'w2', name: 'Worker 2', detail: null, taskId: null },
  ]);
});

test('a task of a project carries only its project\'s jobs and says what that project is on', () => {
  const view = queueView({
    tasks: [task({ id: 'a', project: 'app', status: 'running', startedAt: '2026-11-05T10:00:00Z' }), task({ id: 'b', project: 'web', status: 'running', startedAt: '2026-11-05T10:00:00Z' })],
    jobs: [job({ id: 'ja', slug: 'app/review-1' }), job({ id: 'jb', slug: 'web/review-2' })],
    totals: { done: 0, failed: 0 }, now: '2026-11-05T10:06:00Z', workers: 2,
    live: [{ project: 'app', iid: 1, title: 'A' }, { project: 'web', iid: 2, title: 'B' }],
  });
  assert.deepEqual(view.tasks.map((t) => [t.id, t.jobs.map((j) => j.id), t.detail]), [['a', ['ja'], 'app !1 A'], ['b', ['jb'], 'web !2 B']]);
  assert.deepEqual(view.workers.map((w) => w.taskId), ['a', 'b']);
});
