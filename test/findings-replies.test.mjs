import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReplies } from '../api/src/findings-replies.mjs';
import { buildShape } from '../api/src/findings.mjs';

const THREAD = '0123456789abcdef0123456789abcdef01234567';

test('a reply keeps its thread, verdict and text; a fix resolves the thread by default, a disagreement does not', () => {
  const { replies, warnings } = normalizeReplies([
    { thread: THREAD, verdict: 'fixed', reply: 'Extracted useLatest.' },
    { threadId: 'abcdef12', verdict: 'Not relevant', body: 'Out of scope here.' },
    { thread: 'fedcba98', verdict: 'wrong', reply: 'It is memoized.', resolve: true },
  ]);
  assert.deepEqual(warnings, []);
  assert.deepEqual(replies, [
    { thread: THREAD, verdict: 'fixed', reply: 'Extracted useLatest.', resolve: true },
    { thread: 'abcdef12', verdict: 'not_relevant', reply: 'Out of scope here.', resolve: false },
    { thread: 'fedcba98', verdict: 'wrong', reply: 'It is memoized.', resolve: true },
  ]);
});

test('a reply with no thread id, an unknown verdict, no text or a second reply to a thread is dropped and said', () => {
  const { replies, warnings } = normalizeReplies([
    { thread: 'not an id', verdict: 'fixed', reply: 'x' },
    { thread: THREAD, verdict: 'maybe', reply: 'x' },
    { thread: THREAD, verdict: 'fixed', reply: '  ' },
    { thread: THREAD, verdict: 'answered', reply: 'Yes, on purpose.' },
    { thread: THREAD, verdict: 'fixed', reply: 'again' },
  ]);
  assert.equal(replies.length, 1);
  assert.equal(warnings.length, 4);
  assert.match(warnings.join('\n'), /no thread id[\s\S]*unknown verdict "maybe"[\s\S]*no text[\s\S]*repeats thread/);
  assert.deepEqual(normalizeReplies({}), { replies: [], warnings: ['"replies" is not an array'] });
});

test('a triage with only replies is a valid findings file, and a review has no replies', () => {
  const triage = buildShape({ markdown: '# Triage', findingsRaw: JSON.stringify({ replies: [{ thread: THREAD, verdict: 'already_fixed', reply: 'Done in the last push.' }] }) });
  assert.equal(triage.source, 'json');
  assert.equal(triage.replies.length, 1);
  assert.deepEqual(buildShape({ markdown: '# Review' }).replies, []);
});

test('a tour stop keeps the ids of the threads it answers, and drops what is not an id', async () => {
  const { buildTour } = await import('../api/src/findings-walkthrough.mjs');
  const { tour } = buildTour([{ title: 'Doctor scripts opt out of telemetry', summary: 's', files: ['package.json'], threads: [THREAD, 'nope'] }], []);
  assert.deepEqual(tour[0].threadIds, [THREAD]);
});

test('a stop the bot could not review keeps that mark; the others carry none', async () => {
  const { buildTour } = await import('../api/src/findings-walkthrough.mjs');
  const { tour } = buildTour([{ title: 'Coupons', summary: 's', unreviewed: true }, { title: 'Tests', summary: 's', unreviewed: 'yes' }], []);
  assert.deepEqual(tour.map((s) => s.unreviewed), [true, undefined]);
});

test('a review without an overview or a tour says so; a triage needs neither', () => {
  const review = buildShape({ markdown: '# Review', findingsRaw: JSON.stringify({ verdict: 'APPROVE', findings: [{ title: 'x', severity: 'info' }] }) });
  assert.match(review.warnings.join('\n'), /no overview[\s\S]*no tour/);
  const triage = buildShape({ markdown: '# Triage', findingsRaw: JSON.stringify({ replies: [{ thread: THREAD, verdict: 'answered', reply: 'Yes.', commit: 'abc1234' }] }) });
  assert.doesNotMatch(triage.warnings.join('\n'), /no overview|no tour/);
  assert.equal(triage.replies[0].commit, 'abc1234');
});
