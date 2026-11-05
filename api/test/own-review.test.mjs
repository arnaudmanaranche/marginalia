import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passOver } from '../dist/src/poll-pass.js';
import { planMergeRequests } from '../dist/src/poll-plan.js';
import { kindOf } from '../dist/src/http/review-kind.js';
import { ownReviewOutputPath, reviewOutputPath } from '../dist/src/paths.js';
import { sameMr } from '../dist/src/status.js';
import { parseConfig } from '../dist/src/config-schema.js';

const project = { key: 'p', reviewsDir: '/r', reviewCommand: 'marginalia', triageCommand: 'marginalia', reviewOwn: true };
const mr = (iid, author, over = {}) => ({ iid, sha: `sha${iid}`, title: `MR ${iid}`, source_branch: `feat/b${iid}`, target_branch: 'main', author: { username: author }, project, ...over });

function setup(open, stored = { mineComments: {}, stackBelow: {} }) {
  const calls = { runs: [], status: [], notified: [], entries: null };
  const deps = {
    listOpenMergeRequests: async () => open,
    latestPeerCommentAt: async () => null,
    reviewFileCoversLastPush: async () => false,
    fetchReviewStates: async () => new Map(),
    jiraPriorityOf: async () => null,
    mtime: async () => null,
    reviewPath: (m) => reviewOutputPath(m),
    commentsPath: (m) => `/r/mr-comments-${m.iid}.md`,
    ownPath: (m) => ownReviewOutputPath(m),
    listOwnBranches: async () => [],
    runReview: async (m, path) => (calls.runs.push([m.iid, path]), 'reviewed'),
    runMrComments: async () => 'reviewed',
    loadState: async () => stored,
    saveState: async () => {},
    allowedTargets: () => [],
    settlesConflicts: () => false,
    username: 'me',
    notify: (title) => calls.notified.push(title),
    trackFailure: () => {},
    startDoctor: async () => {},
  };
  const sink = {
    begin: async () => {},
    setMr: async (m, patch, kind) => calls.status.push([m.iid, patch.status, kind]),
    end: async () => {},
    entriesOf: () => [],
    setEntries: async (_p, entries) => { calls.entries = entries; },
  };
  return { deps, sink, calls, stored };
}

test('with reviewOwn, my MRs are planned for an own review too; without it, not', () => {
  const open = [mr(1, 'alice'), mr(2, 'me')];
  const base = { openMrs: open, state: { mineComments: {}, stackBelow: {} }, allowedTargets: [], username: 'me', triageEnabled: true };
  assert.deepEqual(planMergeRequests({ ...base, reviewOwn: true }).ownMrs.map((m) => m.iid), [2]);
  assert.deepEqual(planMergeRequests(base).ownMrs, []);
  assert.deepEqual(planMergeRequests({ ...base, reviewOwn: true }).reviewMrs.map((m) => m.iid), [1]);
});

test('my MR gets an own review in its own file, once per sha, with its own status entry', async () => {
  const { deps, sink, calls, stored } = setup([mr(1, 'alice'), mr(2, 'me')]);
  await passOver(project, deps, sink);
  assert.deepEqual(calls.runs, [[1, '/r/feat-b1.md'], [2, '/r/own-feat-b2.md']]);
  assert.equal(stored[2], 'sha2');
  assert.deepEqual(calls.status, [[1, 'up_to_date', 'review'], [2, 'up_to_date', 'own']]);
  assert.deepEqual(calls.notified, ['Review ready', 'Own review ready']);
  assert.deepEqual(calls.entries.map((e) => [e.iid, e.kind]), [[1, 'review'], [2, 'own'], [2, 'comments']]);
  const again = setup([mr(1, 'alice'), mr(2, 'me')], stored);
  await passOver(project, again.deps, again.sink);
  assert.deepEqual(again.calls.runs, []);
});

test('an own review is told apart by its file, and its status entry by its kind', () => {
  assert.equal(kindOf('own-feat-b2'), 'own');
  assert.equal(kindOf('mr-comments-feat-b2'), 'comments');
  assert.equal(kindOf('feat-b1'), 'review');
  const m = mr(2, 'me');
  assert.ok(sameMr({ iid: 2, project: 'p', kind: 'own' }, m, 'own'));
  assert.ok(!sameMr({ iid: 2, project: 'p', kind: 'comments' }, m, 'own'));
  assert.ok(sameMr({ iid: 2, project: 'p', kind: 'comments' }, m));
});

test('reviewOwn is off unless a project turns it on', () => {
  const cfg = (p) => parseConfig({ gitlabBaseUrl: 'https://g', gitlabUsername: 'me', gitlabToken: 't', projects: [{ gitlabProjectId: 'g/p', repoLocalPath: '/x', ...p }] });
  assert.equal(cfg({}).config.projects[0].reviewOwn, false);
  assert.equal(cfg({ reviewOwn: true }).config.projects[0].reviewOwn, true);
});
