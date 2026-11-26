import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecapResponse } from '@worldia/marginalia-contract';
import { reviewRecap as rawRecap } from '../dist/src/review-recap.js';

// Every answer must be one the contract accepts, whatever branch it came from.
const reviewRecap = async (src) => RecapResponse.parse(await rawRecap(src));

const T = (iso) => Date.parse(iso);
const finding = (id, path, line, title = `finding ${id} is wrong here`) => ({ id, title, severity: 'important', path, line });
const note = (body, mine) => ({ mine, bot: false, body });
// Line 12 of a.ts is rewritten between the baseline's version and the MR now.
const raw = { new_path: 'src/a.ts', old_path: 'src/a.ts', diff: '@@ -10,6 +10,6 @@\n ten\n eleven\n-twelve\n+twelve!\n thirteen\n fourteen\n fifteen' };

// One review: an earlier report (r1, covering sha1), a comment sent after it, and a later report.
function sources(over = {}) {
  const calls = { versions: 0, compare: 0, discussions: 0 };
  const src = {
    id: 'back/feat-x',
    posted: [{ findingId: 'a', at: '2026-11-24T10:00:00Z', state: 'published', body: 'Please guard the total.', url: 'https://gl/a', reply: false }],
    dismissed: [],
    current: async () => ({ shape: { findings: [finding('a', 'src/a.ts', 12), finding('n', 'src/z.ts', 3, 'unrelated race in the queue')], reviewedSha: 'head1' }, at: T('2026-11-25T10:00:00Z') }),
    history: async () => [{ id: 'r1', at: '2026-11-23T10:00:00.000Z' }],
    historyShape: async () => ({ findings: [finding('a', 'src/a.ts', 12)], reviewedSha: 'sha1' }),
    versions: async () => { calls.versions++; return [{ head_commit_sha: 'head1' }, { head_commit_sha: 'sha1' }]; },
    compare: async () => { calls.compare++; return { commits: [1, 2], diffs: [raw] }; },
    discussions: async () => { calls.discussions++; return [{ resolved: true, notes: [note('Please guard the total.', true), note('done', false)] }]; },
    ...over,
  };
  return { src, calls };
}

test('a re-reviewed MR gets its recap: comments by standing, the MR line, and what is new, as the contract says', async () => {
  const { src } = sources();
  const out = await reviewRecap(src);
  const r = out.recap;
  assert.equal(r.baseline.kind, 'submitted');
  assert.equal(r.baseline.at, '2026-11-24T10:00:00.000Z');
  assert.equal(r.comments[0].standing, 'addressed');
  assert.deepEqual(r.mr, { commits: 2, files: 1, commentedFilesTouched: 1 });
  assert.deepEqual(r.newFindings.map((f) => f.id), ['n']);
});

test('the first review has no recap and touches neither GitLab nor the diff', async () => {
  const { src, calls } = sources({ posted: [], history: async () => [] });
  assert.deepEqual(await reviewRecap(src), { recap: null });
  assert.deepEqual(calls, { versions: 0, compare: 0, discussions: 0 });
});

test('with nothing submitted, the baseline is the report before the current one', async () => {
  const { src } = sources({ posted: [] });
  const r = (await reviewRecap(src)).recap;
  assert.equal(r.baseline.kind, 'previous');
  assert.equal(r.baseline.at, '2026-11-23T10:00:00.000Z');
});

test('a reply to a thread counts as a submit but is not a comment of the review', async () => {
  const { src } = sources({ posted: [{ findingId: 'reply-9', at: '2026-11-24T10:00:00Z', state: 'published', body: 'done', url: null, reply: true }] });
  const r = (await reviewRecap(src)).recap;
  assert.equal(r.baseline.kind, 'submitted');
  assert.deepEqual(r.comments, []);
});

test('a submit made from the current report has nothing new to compare findings with', async () => {
  const { src } = sources({ posted: [{ findingId: 'a', at: '2026-11-26T10:00:00Z', state: 'published', body: 'Please guard the total.', url: null, reply: false }] });
  const r = (await reviewRecap(src)).recap;
  assert.deepEqual([r.newFindings.length, r.reworded.length, r.gone.length], [0, 0, 0]);
  assert.equal(r.comments.length, 1);
});

test('when the MR has not moved since the baseline, the diff is empty and is not fetched', async () => {
  const { src, calls } = sources({ historyShape: async () => ({ findings: [], reviewedSha: 'head1' }) });
  const r = (await reviewRecap(src)).recap;
  assert.deepEqual(r.mr, { commits: 0, files: 0, commentedFilesTouched: 0 });
  assert.equal(calls.compare, 0);
});

test('when the version the baseline covered is gone, the MR line is null and nothing is compared', async () => {
  const { src, calls } = sources({ historyShape: async () => ({ findings: [finding('a', 'src/a.ts', 12)], reviewedSha: 'force-pushed-away' }) });
  const r = (await reviewRecap(src)).recap;
  assert.equal(r.mr, null);
  assert.equal(calls.compare, 0);
  assert.equal(r.comments[0].standing, 'addressed');
  assert.equal(r.comments[0].signals.linesChanged, null);
});

test('a commit GitLab no longer has is "gone"; any other GitLab failure is reported, not hidden', async () => {
  const gone = sources({ compare: async () => { throw new Error('GET /compare -> 404: not found'); } });
  assert.equal((await reviewRecap(gone.src)).recap.mr, null);
  const down = sources({ compare: async () => { throw new Error('GET /compare -> 500: boom'); } });
  await assert.rejects(reviewRecap(down.src), /500/);
});

test('a report that did not record its version places the diff by its own time, not by the submit time', async () => {
  const from = [];
  const { src } = sources({
    historyShape: async () => ({ findings: [finding('a', 'src/a.ts', 12)] }),
    versions: async () => [
      { head_commit_sha: 'head2', created_at: '2026-11-24T12:00:00Z' },
      { head_commit_sha: 'pushed-after-the-report', created_at: '2026-11-24T08:00:00Z' },
      { head_commit_sha: 'covered-by-the-report', created_at: '2026-11-22T10:00:00Z' },
    ],
    compare: async (f) => { from.push(f); return { commits: [], diffs: [] }; },
  });
  await reviewRecap(src);
  assert.deepEqual(from, ['covered-by-the-report']);
});
