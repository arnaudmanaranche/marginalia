import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../dist/src/db.js';
import { createQueue } from '../dist/src/queue.js';
import { nextTask, positions, afterRestart, MAX_ATTEMPTS } from '../dist/src/queue-plan.js';
import { countFinished, insertTask, openTasks, pruneFinished, recentTasks } from '../dist/src/queue-store.js';

// A queue on an in-memory database with a clock that ticks once per reading, so order is stable.
function setup() {
  const db = openDatabase(':memory:');
  let tick = 0;
  let ids = 0;
  const now = () => new Date(Date.UTC(2026, 10, 5, 10, 0, tick++)).toISOString();
  return { db, queue: createQueue({ db: () => db, now, newId: () => `t${++ids}` }) };
}

const task = (over) => ({ id: 'x', kind: 'poll', project: null, label: 'x', priority: 'normal', status: 'queued', payload: {}, dedupe: null, enqueuedAt: '2026-11-05T10:00:00Z', startedAt: null, endedAt: null, attempt: 1, error: null, ...over });

test('a person\'s request goes before a poll, then the oldest first', () => {
  const tasks = [
    task({ id: 'a', enqueuedAt: '2026-11-05T10:00:00Z' }),
    task({ id: 'b', enqueuedAt: '2026-11-05T10:01:00Z', priority: 'high' }),
    task({ id: 'c', enqueuedAt: '2026-11-05T10:02:00Z', priority: 'high' }),
    task({ id: 'd', status: 'running' }),
  ];
  assert.equal(nextTask(tasks).id, 'b');
  assert.deepEqual([...positions(tasks)], [['b', 1], ['c', 2], ['a', 3]]);
});

test('a task cut short by a restart is tried again once, then fails', () => {
  assert.deepEqual(afterRestart(task({ status: 'running', attempt: 1 }), 'now'), { status: 'queued', startedAt: null, attempt: 2 });
  assert.equal(afterRestart(task({ status: 'running', attempt: MAX_ATTEMPTS }), 'now').status, 'failed');
});

test('the queue runs one task at a time in order, and goes on after a failure', async () => {
  const { db, queue } = setup();
  const log = [];
  queue.handle('slow', async () => { log.push('a start'); await new Promise((r) => setTimeout(r, 20)); log.push('a end'); return 'A'; });
  queue.handle('bad', async () => { log.push('b'); throw new Error('boom'); });
  queue.handle('last', async () => { log.push('c'); });
  queue.start();
  const slow = queue.enqueue({ kind: 'slow', label: 'slow' });
  const bad = queue.enqueue({ kind: 'bad', label: 'bad' });
  const last = queue.enqueue({ kind: 'last', label: 'last' });
  await assert.rejects(bad, /boom/);
  assert.equal(await slow, 'A');
  await last;
  assert.deepEqual(log, ['a start', 'a end', 'b', 'c']);
  assert.deepEqual(countFinished(db), { done: 2, failed: 1 });
  assert.equal(recentTasks(db).find((t) => t.kind === 'bad').error, 'boom');
});

test('a high task waiting jumps the polls waiting, and a twin request joins the waiting task', async () => {
  const { db, queue } = setup();
  const log = [];
  let release;
  queue.handle('poll', async () => { log.push('poll'); if (!release) await new Promise((r) => { release = r; }); });
  queue.handle('mention', async ({ note }) => { log.push(`mention ${note}`); });
  queue.start();
  const first = queue.enqueue({ kind: 'poll', label: 'poll', dedupe: 'poll' });
  await new Promise((r) => setImmediate(r));
  // The first poll runs: a second one waits behind it, and a third joins the second.
  const second = queue.enqueue({ kind: 'poll', label: 'poll', dedupe: 'poll' });
  const third = queue.enqueue({ kind: 'poll', label: 'poll', dedupe: 'poll' });
  const mention = queue.enqueue({ kind: 'mention', label: 'm', priority: 'high', payload: { note: 7 } });
  assert.equal(openTasks(db).length, 3);
  release();
  await Promise.all([first, second, third, mention]);
  assert.deepEqual(log, ['poll', 'mention 7', 'poll']);
});

test('tasks wait in the database until the line starts, and a running one left by a restart runs again', async () => {
  const db = openDatabase(':memory:');
  insertTask(db, task({ id: 'left', kind: 'work', status: 'running', startedAt: '2026-11-05T09:00:00Z' }));
  const queue = createQueue({ db: () => db });
  const ran = [];
  queue.handle('work', async (_payload, t) => { ran.push(`${t.id}#${t.attempt}`); });
  const waiting = queue.enqueue({ kind: 'work', label: 'new' });
  assert.deepEqual(ran, []);
  queue.start();
  await waiting;
  assert.equal(ran[0], 'left#2');
  assert.equal(ran.length, 2);
});

test('only the latest finished tasks are kept', () => {
  const db = openDatabase(':memory:');
  for (let i = 0; i < 5; i += 1) insertTask(db, task({ id: `d${i}`, status: 'done', endedAt: `2026-11-05T10:0${i}:00Z` }));
  insertTask(db, task({ id: 'q' }));
  pruneFinished(db, 2);
  assert.deepEqual(recentTasks(db).map((t) => t.id), ['q', 'd4', 'd3']);
});
