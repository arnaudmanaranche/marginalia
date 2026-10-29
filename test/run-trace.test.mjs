import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_STEPS, addStep, enterStage, finishTrace, liveSummary, runSummary, startTrace } from '../api/src/run-trace.mjs';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
const { listTraces, pruneTraces, readTrace, readTranscript, runId, saveTrace } = await import('../api/src/run-journal.mjs');

const start = (kind = 'review') => startTrace({ id: 'r1', slug: 'webapp/feat-x', project: 'webapp', iid: 12, kind, command: '/code-review', at: 't0' });
const states = (trace) => trace.stages.map((s) => `${s.id}:${s.state}`);

test('a run starts with every stage of its kind pending', () => {
  assert.deepEqual(states(start()), ['preflight:pending', 'checkout:pending', 'context:pending', 'agent:pending', 'report:pending']);
  assert.match(start('triage').stages[3].label, /answers the reviewers/);
});

test('entering a stage closes the one before and skips any jumped over', () => {
  let t = enterStage(start(), 'checkout', 't1');
  t = enterStage(t, 'agent', 't2');
  assert.deepEqual(states(t), ['preflight:skipped', 'checkout:done', 'context:skipped', 'agent:running', 'report:pending']);
  assert.equal(t.stages[1].endedAt, 't2');
  assert.equal(t.stages[3].startedAt, 't2');
});

test('steps belong to the stage they were taken in, and a sub-agent step says so', () => {
  let t = enterStage(start(), 'agent', 't1');
  t = addStep(t, 'Reading a.ts', 't2', { sub: true });
  assert.deepEqual(t.steps, [{ at: 't2', text: 'Reading a.ts', stage: 'agent', sub: true }]);
});

test('a run past the step cap counts the steps it dropped', () => {
  let t = start();
  for (let i = 0; i < MAX_STEPS + 3; i += 1) t = addStep(t, `s${i}`, 't');
  assert.equal(t.steps.length, MAX_STEPS);
  assert.equal(runSummary(t).stepCount, MAX_STEPS + 3);
  assert.equal(runSummary(t).steps, undefined);
});

test('a failure marks the stage it happened in and keeps the error', () => {
  let t = enterStage(start(), 'checkout', 't1');
  t = enterStage(t, 'agent', 't2');
  t = finishTrace(t, 'failed', 't3', 'claude exited with code 1');
  assert.deepEqual(states(t), ['preflight:skipped', 'checkout:done', 'context:skipped', 'agent:failed', 'report:skipped']);
  assert.equal(t.outcome, 'failed');
  assert.equal(t.error, 'claude exited with code 1');
  assert.equal(t.failure.kind, 'unknown');
  assert.equal(t.endedAt, 't3');
});

test('a success closes the last stage', () => {
  const t = finishTrace(enterStage(start(), 'report', 't1'), 'reviewed', 't2');
  assert.equal(t.stages.at(-1).state, 'done');
  assert.equal(t.error, null);
});

test('the live summary carries the stages and the last steps only', () => {
  let t = enterStage(start(), 'agent', 't1');
  for (let i = 0; i < 20; i += 1) t = addStep(t, `s${i}`, 't');
  const live = liveSummary(t);
  assert.equal(live.runId, 'r1');
  assert.equal(live.progress.length, 8);
  assert.equal(live.progress.at(-1), 's19');
  assert.equal(live.stages[3].state, 'running');
});

test('the journal keeps runs per review, newest first, and prunes the oldest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'marginalia-runs-'));
  const ids = ['2026-10-01T10-00-00-000Z-review', '2026-10-02T10-00-00-000Z-review', '2026-10-03T10-00-00-000Z-review'];
  for (const id of ids) await saveTrace({ ...start(), id }, root);
  await writeFile(join(root, 'webapp', 'feat-x', `${ids[0]}.stream.jsonl`), '{"type":"system"}\n');
  assert.deepEqual((await listTraces('webapp', 'feat-x', { root })).map((r) => r.id), [...ids].reverse());
  assert.equal((await readTrace('webapp', 'feat-x', ids[1], root)).id, ids[1]);
  assert.equal(await readTrace('webapp', 'feat-x', '../../etc', root), null);
  assert.equal(await readTranscript('webapp', 'feat-x', ids[0], { root }), '{"type":"system"}\n');
  await pruneTraces('webapp', 'feat-x', { keep: 1, root });
  assert.deepEqual(await readdir(join(root, 'webapp', 'feat-x')), [`${ids[2]}.json`]);
});

test('a run id sorts by time and is safe as a file name', () => {
  assert.equal(runId('2026-10-28T16:05:51.598Z', 'triage'), '2026-10-28T16-05-51-598Z-triage');
});

test('a staged run plans the stages it learns, and runs some side by side', async () => {
  const { planStages, beginStage, endStage } = await import('../api/src/run-trace.mjs');
  let t = startTrace({ id: 'r2', slug: 'webapp/feat-x', project: 'webapp', iid: 12, kind: 'review', command: 'marginalia', at: 't0', plan: 'staged-review' });
  t = enterStage(t, 'map', 't1');
  t = planStages(t, 'map', [['chapter-1', 'Review: coupons'], ['chapter-2', 'Review: tests'], ['map', 'dup']]);
  assert.deepEqual(t.stages.map((s) => s.id), ['preflight', 'checkout', 'context', 'map', 'chapter-1', 'chapter-2', 'report']);
  t = enterStage(t, 'chapter-1', 't2');
  t = beginStage(t, 'chapter-2', 't2');
  t = addStep(t, 'Reading b.ts', 't3', { stage: 'chapter-2' });
  assert.equal(t.steps.at(-1).stage, 'chapter-2');
  t = endStage(t, 'chapter-2', 't4');
  t = finishTrace(t, 'failed', 't5', 'boom');
  assert.deepEqual(states(t).slice(3), ['map:done', 'chapter-1:failed', 'chapter-2:done', 'report:skipped']);
});
