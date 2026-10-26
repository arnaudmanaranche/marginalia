import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  MR_REVIEW_BOT_SKIP_CONFIG_CHECK: '1', MARGINALIA_DB: ':memory:',
  GITLAB_BASE_URL: 'https://git.example.com', GITLAB_USERNAME: 'dev1', GITLAB_TOKEN: 't', GITLAB_PROJECT_ID: 'group/demo', REPO_LOCAL_PATH: '/tmp/none',
});
const { eventUuid, runEvent, failureEvent, errorKind, eventsFromRuns } = await import('../lib/run-events.mjs');
const { createPosthogClient, posthogFromEnv } = await import('../lib/posthog.mjs');
const { openDatabase } = await import('../lib/db.mjs');
const { insertRun, countRuns } = await import('../lib/db-store.mjs');
const { trackRun, trackFailure } = await import('../lib/telemetry.mjs');

const run = { at: '2026-10-21T10:00:00.000Z', project: 'webapp', iid: 3979, kind: 'review', command: '/code-review', costUsd: 1.15234567, outputTokens: 9347, turns: 21, durationMs: 210_000 };
const ctx = { reviewer: 'dev1', version: '2.0.0', container: false };

test('the same run always has the same event id, and it is shaped like a uuid', () => {
  assert.equal(eventUuid('a'), eventUuid('a'));
  assert.notEqual(eventUuid('a'), eventUuid('b'));
  assert.match(eventUuid('a'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('a run event carries ids and numbers, rounded, flagged as a re-review from the second pass', () => {
  const first = runEvent({ run, runNumber: 1, ...ctx });
  assert.equal(first.event, 'marginalia_run');
  assert.equal(first.distinct_id, 'marginalia:dev1');
  assert.equal(first.timestamp, run.at);
  assert.deepEqual({ ...first.properties, marginalia_version: undefined }, {
    $process_person_profile: false, $lib: 'marginalia', reviewer: 'dev1', marginalia_version: undefined, in_container: false,
    project: 'webapp', mr_iid: 3979, kind: 'review', command: '/code-review', outcome: 'completed',
    cost_usd: 1.1523, output_tokens: 9347, turns: 21, duration_ms: 210_000, run_number: 1, rerun: false,
  });
  assert.equal(runEvent({ run, runNumber: 2, ...ctx }).properties.rerun, true);
});

test('the report adds the verdict and counts, and nothing that is text', () => {
  const e = runEvent({ run, runNumber: 1, ...ctx, report: { source: 'file', verdict: 'REQUEST_CHANGES', risk: 'low', critical: 0, important: 2, postable: 2, warnings: 1 } });
  assert.equal(e.properties.outcome, 'reported');
  assert.equal(e.properties.verdict, 'REQUEST_CHANGES');
  assert.equal(e.properties.important, 2);
  for (const value of Object.values(e.properties)) assert.ok(typeof value !== 'string' || value.length < 40, `short value only: ${value}`);
});

test('a failure sends the class of error and never its message', () => {
  const e = failureEvent({ project: 'webapp', iid: 7, kind: 'review', command: '/code-review', error: 'Command failed: git clean -fdx at /Users/me/secret/path', reviewer: 'dev1', at: run.at });
  assert.equal(e.properties.outcome, 'failed');
  assert.equal(e.properties.error_kind, 'git');
  assert.ok(!JSON.stringify(e).includes('/Users/me'));
  for (const [message, kind] of [['GitLab API /x -> 502', 'gitlab'], ['request timed out', 'timeout'], ['tool refused: Bash(rm)', 'permission'], ['did not produce a report', 'no_report'], ['claude exited with code 1', 'claude'], ['boom', 'other']]) {
    assert.equal(errorKind(message), kind, message);
  }
});

test('past runs are numbered per MR and kind in order', () => {
  const events = eventsFromRuns([run, { ...run, at: '2026-10-22T10:00:00.000Z' }, { ...run, iid: 1, at: '2026-10-22T11:00:00.000Z' }, { ...run, kind: 'triage', at: '2026-10-22T12:00:00.000Z' }], ctx);
  assert.deepEqual(events.map((e) => e.properties.run_number), [1, 2, 1, 1]);
  assert.equal(new Set(events.map((e) => e.uuid)).size, 4);
});

test('the client posts batches to /batch/ with the key, in chunks, and reports failures instead of throwing', async () => {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: calls.length !== 2, status: 500 }; };
  const client = createPosthogClient({ host: 'https://eu.i.posthog.com/', key: 'phc_x', fetchFn, chunk: 100 });
  const result = await client.send(Array.from({ length: 250 }, (_, i) => ({ event: 'e', i })));
  assert.deepEqual(calls.map((c) => c.url), Array(3).fill('https://eu.i.posthog.com/batch/'));
  assert.equal(calls[0].body.api_key, 'phc_x');
  assert.deepEqual(calls.map((c) => c.body.batch.length), [100, 100, 50]);
  assert.deepEqual(result, { sent: 150, failed: 100, error: 'HTTP 500' });
  const down = await createPosthogClient({ host: 'https://x.test', key: 'k', fetchFn: async () => { throw new Error('ENOTFOUND'); } }).send([{}]);
  assert.deepEqual(down, { sent: 0, failed: 1, error: 'ENOTFOUND' });
});

test('telemetry is on only with a key and a host, and off whatever else when told so', () => {
  assert.equal(posthogFromEnv({}).client, null);
  assert.match(posthogFromEnv({ POSTHOG_KEY: 'k' }).problem, /POSTHOG_HOST/);
  assert.ok(posthogFromEnv({ POSTHOG_KEY: 'k', POSTHOG_HOST: 'https://x.test' }).client);
  assert.equal(posthogFromEnv({ POSTHOG_KEY: 'k', POSTHOG_HOST: 'https://x.test', MARGINALIA_TELEMETRY: 'off' }).client, null);
});

test('countRuns counts the passes of one MR and kind, with the one just recorded', () => {
  const db = openDatabase(':memory:');
  insertRun(db, run);
  insertRun(db, { ...run, at: '2026-10-22T10:00:00.000Z' });
  insertRun(db, { ...run, iid: 1 });
  insertRun(db, { ...run, kind: 'triage' });
  assert.equal(countRuns(db, { project: 'webapp', iid: 3979, kind: 'review' }), 2);
  assert.equal(countRuns(db, { project: 'webapp', iid: 99, kind: 'review' }), 0);
});

const realFetch = globalThis.fetch;
const sent = [];
beforeEach(() => { sent.length = 0; globalThis.fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; }; });
after(() => { globalThis.fetch = realFetch; });
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test('trackRun sends one event when configured, with the run number, and nothing when not', async () => {
  trackRun({ run, report: { source: 'file', verdict: 'APPROVE', critical: 0, important: 0, postable: 0, warnings: 0 } });
  await settle();
  assert.equal(sent.length, 0, 'not configured: nothing leaves');
  Object.assign(process.env, { POSTHOG_HOST: 'https://eu.i.posthog.com', POSTHOG_KEY: 'phc_test' });
  try {
    trackRun({ run, report: { source: 'file', verdict: 'APPROVE', critical: 0, important: 1, postable: 1, warnings: 0 } });
    trackFailure({ mr: { iid: 7, project: { key: 'webapp' } }, kind: 'triage', command: '/mr-comments', error: new Error('claude exited with code 1') });
    await settle();
    assert.equal(sent.length, 2);
    assert.equal(sent[0].url, 'https://eu.i.posthog.com/batch/');
    assert.equal(sent[0].body.batch[0].properties.verdict, 'APPROVE');
    assert.equal(sent[0].body.batch[0].properties.reviewer, 'dev1');
    assert.equal(sent[1].body.batch[0].properties.error_kind, 'claude');
    process.env.MARGINALIA_TELEMETRY = 'off';
    trackRun({ run });
    await settle();
    assert.equal(sent.length, 2, 'off means off');
  } finally {
    delete process.env.POSTHOG_HOST; delete process.env.POSTHOG_KEY; delete process.env.MARGINALIA_TELEMETRY;
  }
});
