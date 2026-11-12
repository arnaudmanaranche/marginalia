import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passOver } from '../dist/src/poll-pass.js';

// passOver() across its interface only: fake deps, a recording sink, plain-object state.
const project = { key: 'p', triage: true };
const mr = (iid, over = {}) => ({ iid, sha: `sha${iid}`, title: `MR ${iid}`, source_branch: `b${iid}`, target_branch: 'main', author: { username: 'alice' }, project, ...over });

function setup({ open = [], state = {}, ...over } = {}) {
  const calls = { reviewed: [], triaged: [], saved: [], notified: [], failed: [], doctor: [], entries: null, mrStatus: [], busy: 0 };
  const stored = { mineComments: {}, stackBelow: {}, ...state };
  const deps = {
    listOpenMergeRequests: async () => open,
    latestPeerCommentAt: async () => null,
    reviewFileCoversLastPush: async () => false,
    fetchReviewStates: async () => new Map(),
    jiraPriorityOf: async () => null,
    mtime: async () => null,
    reviewPath: (m) => `/r/${m.iid}.md`,
    commentsPath: (m) => `/r/${m.iid}.comments.md`,
    runReview: async (m) => (calls.reviewed.push(m.iid), 'reviewed'),
    runMrComments: async (m) => (calls.triaged.push(m.iid), 'reviewed'),
    loadState: async () => stored,
    saveState: async (_p, s) => calls.saved.push(JSON.parse(JSON.stringify(s))),
    allowedTargets: () => [],
    settlesConflicts: () => false,
    username: 'me',
    notify: (title) => calls.notified.push(title),
    trackFailure: ({ kind }) => calls.failed.push(kind),
    startDoctor: async (a) => calls.doctor.push(a.runId),
    ...over,
  };
  const sink = {
    begin: async () => { calls.busy += 1; },
    setMr: async (m, patch) => calls.mrStatus.push([m.iid, patch.status]),
    end: async () => { calls.busy -= 1; },
    entriesOf: () => [],
    setEntries: async (_p, entries) => { calls.entries = entries; },
  };
  return { deps, sink, calls, stored };
}

test('reviews an MR it has not seen, records its sha and says so', async () => {
  const { deps, sink, calls, stored } = setup({ open: [mr(1)] });
  const out = await passOver(project, deps, sink);
  assert.deepEqual(calls.reviewed, [1]);
  assert.equal(stored[1], 'sha1');
  assert.deepEqual(calls.mrStatus, [[1, 'up_to_date']]);
  assert.deepEqual(calls.notified, ['Review ready']);
  assert.equal(calls.busy, 0);
  assert.deepEqual(out, { retrySoon: false });
  assert.equal(calls.entries[0].status, 'pending');
});

test('leaves an MR alone that was reviewed at this sha', async () => {
  const { deps, sink, calls } = setup({ open: [mr(1)], state: { 1: 'sha1' } });
  await passOver(project, deps, sink);
  assert.deepEqual(calls.reviewed, []);
  assert.equal(calls.entries[0].status, 'up_to_date');
});

test('trusts a review file newer than the last push for an MR it never saw', async () => {
  const { deps, sink, calls, stored } = setup({ open: [mr(1)], reviewFileCoversLastPush: async () => true });
  await passOver(project, deps, sink);
  assert.deepEqual(calls.reviewed, []);
  assert.equal(stored[1], 'sha1');
});

test('a skipped run is not recorded, so the next poll retries it', async () => {
  const { deps, sink, calls, stored } = setup({ open: [mr(1)], runReview: async () => 'skipped' });
  await passOver(project, deps, sink);
  assert.equal(stored[1], undefined);
  assert.deepEqual(calls.mrStatus, [[1, 'skipped']]);
  assert.deepEqual(calls.notified, []);
});

test('a transient failure asks for a sooner poll and raises no alarm', async () => {
  const { deps, sink, calls } = setup({ open: [mr(1)], runReview: async () => { throw new Error('getaddrinfo ENOTFOUND gitlab.example.com'); } });
  const out = await passOver(project, deps, sink);
  assert.equal(out.retrySoon, true);
  assert.deepEqual(calls.notified, []);
  assert.deepEqual(calls.failed, ['review']);
  assert.deepEqual(calls.mrStatus, [[1, 'failed']]);
  assert.equal(calls.busy, 0);
});

test('another failure is notified, and a failed run goes to the doctor', async () => {
  const err = Object.assign(new Error('Something nobody planned for happened'), { run: { id: 'run-1', fileSlug: 'mr-1' } });
  const { deps, sink, calls } = setup({ open: [mr(1)], runReview: async () => { throw err; } });
  const out = await passOver(project, deps, sink);
  assert.equal(out.retrySoon, false);
  assert.equal(calls.notified.length, 1);
  assert.match(calls.notified[0], /^Review failed: /);
  assert.deepEqual(calls.doctor, ['run-1']);
});

test('triages my own MR on a new peer comment and records the signal', async () => {
  const mine = mr(2, { author: { username: 'me' } });
  const { deps, sink, calls, stored } = setup({ open: [mine], latestPeerCommentAt: async () => '2026-10-01T10:00:00Z' });
  await passOver(project, deps, sink);
  assert.deepEqual(calls.triaged, [2]);
  assert.equal(stored.mineComments[2], '2026-10-01T10:00:00Z|');
  assert.deepEqual(calls.notified, ['Comments triaged']);
});

test('a conflict triggers a triage only when the triage settles conflicts', async () => {
  const mine = mr(2, { author: { username: 'me' }, has_conflicts: true });
  const off = setup({ open: [mine] });
  await passOver(project, off.deps, off.sink);
  assert.deepEqual(off.calls.triaged, []);
  const on = setup({ open: [mine], settlesConflicts: () => true });
  await passOver(project, on.deps, on.sink);
  assert.deepEqual(on.calls.triaged, [2]);
});

test('state of MRs that are no longer open is pruned', async () => {
  const { deps, sink, stored } = setup({ open: [mr(1)], state: { 1: 'sha1', 9: 'old' } });
  await passOver(project, deps, sink);
  assert.equal(stored[9], undefined);
});

test('an unreadable review state keeps what the MR had', async () => {
  const { deps, sink, calls } = setup({ open: [mr(1)], state: { 1: 'sha1' }, fetchReviewStates: async () => new Map([[1, null]]) });
  sink.entriesOf = () => [{ iid: 1, myState: 'approved' }];
  await passOver(project, deps, sink);
  assert.equal(calls.entries[0].myState, 'approved');
});

const spent = (over) => () => ({ over, spentUsd: over ? 26 : 1, limitUsd: 25 });

test('once the daily budget is spent, automatic work waits and is not recorded', async () => {
  const { deps, sink, calls, stored } = setup({ open: [mr(1)], budget: spent(true) });
  await passOver(project, deps, sink);
  assert.deepEqual(calls.reviewed, []);
  assert.equal(stored[1], undefined);
  assert.deepEqual(calls.mrStatus, [[1, 'skipped']]);
  assert.equal(calls.busy, 0);
});

test('under the budget, work runs as usual', async () => {
  const { deps, sink, calls } = setup({ open: [mr(1)], budget: spent(false) });
  await passOver(project, deps, sink);
  assert.deepEqual(calls.reviewed, [1]);
});

test('the MR a person asked to review again runs past the budget, the others still wait', async () => {
  const { deps, sink, calls } = setup({ open: [mr(1), mr(2)], budget: spent(true) });
  await passOver(project, deps, sink, { project: 'p', iid: 2, kind: 'review', sourceBranch: 'b2' });
  assert.deepEqual(calls.reviewed, [2]);
  assert.deepEqual(calls.mrStatus, [[1, 'skipped'], [2, 'up_to_date']]);
});

test('a budget that cannot be read holds nothing back', async () => {
  const { deps, sink, calls } = setup({ open: [mr(1)], budget: () => { throw new Error('no db'); } });
  await passOver(project, deps, sink);
  assert.deepEqual(calls.reviewed, [1]);
});

test('over the budget, a failure does not start the doctor by itself', async () => {
  const err = Object.assign(new Error('Something nobody planned for happened'), { run: { id: 'run-1', fileSlug: 'mr-1' } });
  const { deps, sink, calls } = setup({ open: [mr(1)], runReview: async () => { throw err; }, budget: spent(true) });
  await passOver(project, deps, sink, { project: 'p', iid: 1, kind: 'review', sourceBranch: 'b1' });
  assert.deepEqual(calls.failed, ['review']);
  assert.deepEqual(calls.doctor, []);
});

// Holds (GLOSSARY: Hold): the poll reads the last push and the approvals of an MR it would review.
const DAY = 24 * 60 * 60 * 1000;
const facts = (pushedDaysAgo, approvedBy = []) => async () => ({ lastPushAt: Date.now() - pushedDaysAgo * DAY, approvedBy });

test('an MR with no push in the stale window waits, and is not recorded', async () => {
  const { deps, sink, calls, stored } = setup({ open: [mr(1)], reviewFacts: facts(20), staleAfterDays: () => 14 });
  await passOver(project, deps, sink);
  assert.deepEqual(calls.reviewed, []);
  assert.equal(stored[1], undefined);
  assert.deepEqual(calls.mrStatus, [[1, 'skipped']]);
});

test('an MR a person approved since its last push waits; one approved before it runs', async () => {
  const before = new Date(Date.now() - 3 * DAY).toISOString();
  const after = new Date(Date.now() - DAY).toISOString();
  const { deps, sink, calls } = setup({
    open: [mr(1), mr(2)],
    staleAfterDays: () => 14,
    reviewFacts: async (m) => ({ lastPushAt: Date.now() - 2 * DAY, approvedBy: [{ username: 'bob', at: m.iid === 1 ? after : before }] }),
  });
  await passOver(project, deps, sink);
  assert.deepEqual(calls.reviewed, [2]);
});

test("the author's own approval does not hold the review", async () => {
  const { deps, sink, calls } = setup({ open: [mr(1)], staleAfterDays: () => 14, reviewFacts: facts(1, [{ username: 'alice', at: null }]) });
  await passOver(project, deps, sink);
  assert.deepEqual(calls.reviewed, [1]);
});

test('the MR a person asked to review again runs past a hold', async () => {
  const { deps, sink, calls } = setup({ open: [mr(1)], staleAfterDays: () => 14, reviewFacts: facts(30, [{ username: 'bob', at: null }]) });
  await passOver(project, deps, sink, { project: 'p', iid: 1, kind: 'review', sourceBranch: 'b1' });
  assert.deepEqual(calls.reviewed, [1]);
});

test('facts that cannot be read hold nothing back', async () => {
  const { deps, sink, calls } = setup({ open: [mr(1)], staleAfterDays: () => 14, reviewFacts: async () => { throw new Error('GitLab down'); } });
  await passOver(project, deps, sink);
  assert.deepEqual(calls.reviewed, [1]);
});
