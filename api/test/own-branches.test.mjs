import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchStateKey, branchTarget, planOwnBranches } from '../dist/src/own-branches-plan.js';
import { passOver } from '../dist/src/poll-pass.js';
import { ownReviewOutputPath, reviewOutputPath } from '../dist/src/paths.js';
import { sameMr } from '../dist/src/status.js';
import { branchCheck } from '../dist/src/preflight-checks.js';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const day = 24 * 60 * 60 * 1000;
const branch = (name, over = {}, commit = {}) => ({ name, protected: false, default: false, commit: { id: `sha-${name}`, author_email: 'me@x.io', author_name: 'Me', committed_date: new Date(NOW - day).toISOString(), message: 'wip', ...commit }, ...over });
const me = { emails: ['ME@x.io'], name: 'Me' };
const plan = (branches, openMrBranches = []) => planOwnBranches({ branches, me, openMrBranches: new Set(openMrBranches), defaultBranch: 'develop', now: NOW, staleDays: 14 }).map((b) => b.name);

test('my recent branches without an open MR are planned; others, old, protected, default or with an MR are not', () => {
  assert.deepEqual(plan([
    branch('feat/a'),
    branch('feat/theirs', {}, { author_email: 'alice@x.io', author_name: 'Alice' }),
    branch('feat/old', {}, { committed_date: new Date(NOW - 20 * day).toISOString() }),
    branch('release', { protected: true }),
    branch('develop'),
    branch('feat/has-mr'),
    branch('feat/by-name', {}, { author_email: 'other@laptop' }),
  ], ['feat/has-mr']), ['feat/a', 'feat/by-name']);
});

test('a branch becomes a review target with no MR number, aimed at the default branch', () => {
  const t = branchTarget({ key: 'p' }, branch('feat/a'), { defaultBranch: 'develop', username: 'me', webBase: 'https://g/x' });
  assert.equal(t.iid, null);
  assert.equal(t.target_branch, 'develop');
  assert.equal(t.sha, 'sha-feat/a');
  assert.equal(t.web_url, 'https://g/x/-/tree/feat%2Fa');
  assert.equal(branchStateKey('feat/a'), 'branch:feat/a');
});

test('a branch is told apart by its name in the status, and checked by its name on origin', () => {
  const t = { iid: null, source_branch: 'feat/a', project: { key: 'p' } };
  assert.ok(sameMr({ iid: null, sourceBranch: 'feat/a', project: 'p', kind: 'own' }, t, 'own'));
  assert.ok(!sameMr({ iid: null, sourceBranch: 'feat/b', project: 'p', kind: 'own' }, t, 'own'));
  assert.match(branchCheck({ stdout: 'abc12345\trefs/heads/feat/a', iid: null, branch: 'feat/a' }).detail, /branch feat\/a is at abc12345/);
  assert.match(branchCheck({ stdout: '', iid: null, branch: 'feat/a' }).detail, /branch may have been deleted/);
});

const project = { key: 'p', reviewsDir: '/r', reviewCommand: '/code-review', triageCommand: '', reviewOwn: true };
const mr = (iid, author, source) => ({ iid, sha: `sha-${source}`, title: `MR ${iid}`, source_branch: source, target_branch: 'develop', author: { username: author }, project });

function setup(open, branches, stored = { mineComments: {}, stackBelow: {} }) {
  const calls = { runs: [], entries: null };
  const deps = {
    listOpenMergeRequests: async () => open,
    listOwnBranches: async (_p, _open, state) => branches.map((b) => {
      const target = branchTarget(project, b, { defaultBranch: 'develop', username: 'me', webBase: 'https://g/x' });
      return { target, current: state[branchStateKey(b.name)] === target.sha };
    }),
    latestPeerCommentAt: async () => null, reviewFileCoversLastPush: async () => false, fetchReviewStates: async () => new Map(),
    jiraPriorityOf: async () => null, mtime: async () => null,
    reviewPath: (m) => reviewOutputPath(m), commentsPath: (m) => `/r/c-${m.iid}.md`, ownPath: (m) => ownReviewOutputPath(m),
    runReview: async (m, path, _stack, opts) => (calls.runs.push([m.iid, path, opts?.own ?? false]), 'reviewed'),
    runMrComments: async () => 'reviewed', loadState: async () => stored, saveState: async () => {},
    allowedTargets: () => [], settlesConflicts: () => false, username: 'me', notify: () => {}, trackFailure: () => {}, startDoctor: async () => {},
  };
  const sink = { begin: async () => {}, setMr: async () => {}, end: async () => {}, entriesOf: () => [], setEntries: async (_p, e) => { calls.entries = e; } };
  return { deps, sink, calls, stored };
}

test('my branch gets an own review once per push, read-only, then its MR does not repeat it at the same sha', async () => {
  const first = setup([], [branch('feat/a')]);
  await passOver(project, first.deps, first.sink);
  assert.deepEqual(first.calls.runs, [[null, '/r/own-feat-a.md', true]]);
  assert.equal(first.stored['branch:feat/a'], 'sha-feat/a');
  assert.deepEqual(first.calls.entries.map((e) => [e.iid, e.kind, e.status]), [[null, 'own', 'pending']]);

  const again = setup([], [branch('feat/a')], first.stored);
  await passOver(project, again.deps, again.sink);
  assert.deepEqual(again.calls.runs, []);

  // The MR is opened at the same commit: its own review is already there, in the same file.
  const opened = setup([mr(7, 'me', 'feat/a')], [], first.stored);
  await passOver(project, opened.deps, opened.sink);
  assert.deepEqual(opened.calls.runs, []);
  assert.equal(opened.stored['branch:feat/a'], 'sha-feat/a');
});

test('a branch listing that fails leaves the rest of the pass alone', async () => {
  const s = setup([mr(1, 'alice', 'feat/x')], []);
  s.deps.listOwnBranches = async () => { throw new Error('403'); };
  await passOver(project, s.deps, s.sink);
  assert.deepEqual(s.calls.runs, [[1, '/r/feat-x.md', false]]);
});
