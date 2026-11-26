import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Recap } from '@worldia/marginalia-contract';
import { buildRecap } from '../dist/src/recap-build.js';
import { parseDiff } from '../dist/src/mr-diff.js';

const finding = (id, path, line, title = `finding ${id} is wrong here`) => ({ id, title, severity: 'important', path, line });
const file = (path, diff, over = {}) => ({ path, oldPath: null, status: 'modified', omitted: false, lines: parseDiff(diff), ...over });
const note = (body, mine) => ({ mine, bot: false, body });
const baseline = { kind: 'submitted', at: Date.parse('2026-11-25T10:00:00Z'), report: { id: 'r2', at: 0 } };

// a.ts: line 12 rewritten and a line added at new line 40.
const diff = '@@ -10,6 +10,6 @@\n ten\n eleven\n-twelve\n+twelve!\n thirteen\n fourteen\n fifteen\n@@ -38,3 +38,4 @@\n thirty-eight\n thirty-nine\n+forty\n forty-one';
const files = [file('src/a.ts', diff)];
const previous = [finding('a', 'src/a.ts', 12), finding('b', 'src/b.ts', 5), finding('c', 'src/c.ts', 7), finding('f', 'src/f.ts', 3)];
const current = [finding('a', 'src/a.ts', 12), finding('d', 'src/a.ts', 40), finding('e', 'src/z.ts', 9)];
const posted = [
  { findingId: 'a', body: 'Please guard the total.', url: 'https://gl/a' },
  { findingId: 'b', body: 'Handle the empty list.', url: 'https://gl/b' },
  { findingId: 'e', body: 'still a draft', url: null, state: 'draft' },
];
const threads = [
  { resolved: true, notes: [note('Please guard the total.', true), note('done', false)] },
  { resolved: false, notes: [note('Handle the empty list.', true), note('will see', false)] },
];
const input = { slug: 'back/feat-x', baseline, current, previous, posted, dismissed: ['c'], threads, files, commits: 3 };
const standingOf = (r, id) => r.comments.find((c) => c.findingId === id)?.standing;

test('the recap says where each comment stands, from its thread and the code, and parses as the contract', () => {
  const r = buildRecap(input);
  Recap.parse(r);
  assert.equal(standingOf(r, 'a'), 'addressed');
  assert.equal(standingOf(r, 'b'), 'untouched');
  assert.equal(standingOf(r, 'c'), 'dropped');
  assert.equal(r.comments.length, 3);
  assert.equal(r.comments.find((c) => c.findingId === 'b').signals.replied, true);
});

test('a draft is not a comment of the review yet', () => {
  assert.ok(!buildRecap(input).comments.map((c) => c.findingId).includes('e'));
});

test('a published comment whose finding is in neither report stays a comment, titled by its first line', () => {
  const r = buildRecap({ ...input, posted: [{ findingId: 'old', body: '\nGuard the total before dividing.\nMore detail.', url: 'https://gl/o' }], dismissed: [] });
  Recap.parse(r);
  const c = r.comments.find((k) => k.findingId === 'old');
  assert.equal(c.title, 'Guard the total before dividing.');
  assert.deepEqual([c.path, c.line, c.standing], [null, null, 'untouched']);
});

test('two comments with the same text each get their own thread, the one at their own place first', () => {
  const same = 'Please guard this.';
  const two = [finding('a', 'src/a.ts', 12), finding('b', 'src/b.ts', 5)];
  const r = buildRecap({
    ...input, previous: two, current: two, dismissed: [], files,
    posted: [{ findingId: 'a', body: same, url: 'u1' }, { findingId: 'b', body: same, url: 'u2' }],
    threads: [
      { resolved: false, path: 'src/b.ts', line: 5, notes: [note(same, true)] },
      { resolved: true, path: 'src/a.ts', line: 12, notes: [note(same, true), note('done', false)] },
    ],
  });
  assert.equal(r.comments.find((c) => c.findingId === 'a').signals.resolved, true);
  assert.equal(r.comments.find((c) => c.findingId === 'b').signals.resolved, false);
});

test('a finding I dropped claims nothing about the code, and its file is not one I commented on', () => {
  const r = buildRecap({ ...input, posted: [], dismissed: ['a'], threads: [] });
  const c = r.comments.find((k) => k.findingId === 'a');
  assert.equal(c.standing, 'dropped');
  assert.equal(c.signals.linesChanged, null);
  assert.equal(r.mr.commentedFilesTouched, 0);
});

test('new findings say whether they sit on code the author changed; a finding the bot dropped is gone', () => {
  const r = buildRecap(input);
  assert.deepEqual(r.newFindings.map((f) => [f.id, f.onChangedCode]), [['d', true], ['e', false]]);
  assert.deepEqual(r.gone.map((f) => f.id), ['f']);
  assert.equal(r.gone[0].onChangedCode, false);
});

test('a finding the bot dropped is not listed as gone when it is one of my comments: its standing says it', () => {
  // b was posted and c was dropped by me, and neither is in the current report.
  const ids = buildRecap(input).gone.map((f) => f.id);
  assert.ok(!ids.includes('b') && !ids.includes('c'));
});

test('the MR line counts commits, changed files, and those I commented on', () => {
  assert.deepEqual(buildRecap(input).mr, { commits: 3, files: 1, commentedFilesTouched: 1 });
});

test('the counts are computed once and match the lists', () => {
  assert.deepEqual(buildRecap(input).counts, { addressed: 1, contested: 0, untouched: 1, dropped: 1, newFindings: 2, reworded: 0, gone: 1 });
});

test('with no baseline there is no recap', () => {
  assert.equal(buildRecap({ ...input, baseline: { kind: 'previous', at: null, report: null } }), null);
});

test('a submit from the current report has comments but nothing new, gone or reworded to compare', () => {
  const r = buildRecap({ ...input, previous: null });
  Recap.parse(r);
  assert.equal(standingOf(r, 'a'), 'addressed');
  assert.deepEqual([r.newFindings.length, r.reworded.length, r.gone.length], [0, 0, 0]);
});

test('when the reviewed version is gone, the MR line is null and the code is not guessed', () => {
  const r = buildRecap({ ...input, files: null });
  Recap.parse(r);
  assert.equal(r.mr, null);
  assert.equal(standingOf(r, 'a'), 'addressed');
  assert.equal(standingOf(r, 'b'), 'untouched');
  assert.ok(r.newFindings.every((f) => f.onChangedCode === null));
});

test('a reworded finding is a pair, and is neither new nor gone', () => {
  const r = buildRecap({ ...input, previous: [finding('a', 'src/a.ts', 12, 'cart total goes negative with coupon')], current: [finding('q', 'src/a.ts', 12, 'coupon makes total wrong later')], posted: [], dismissed: [], threads: [] });
  Recap.parse(r);
  assert.equal(r.reworded.length, 1);
  assert.deepEqual([r.newFindings.length, r.gone.length], [0, 0]);
});

test('with no place to tell them apart, two comments with the same text still never share a thread', () => {
  const same = 'Please guard this.';
  const two = [finding('a', null, null), finding('b', null, null)];
  const r = buildRecap({
    ...input, previous: two, current: two, dismissed: [], files: null,
    posted: [{ findingId: 'a', body: same, url: 'u1' }, { findingId: 'b', body: same, url: 'u2' }],
    threads: [{ resolved: true, notes: [note(same, true)] }, { resolved: false, notes: [note(same, true)] }],
  });
  assert.deepEqual(r.comments.map((c) => c.signals.resolved), [true, false]);
});

test('a finding keeps the severity its report gave it', () => {
  const r = buildRecap({ ...input, current: [{ ...finding('d', 'src/a.ts', 40, 'unrelated race in the queue'), severity: 'critical' }] });
  assert.equal(r.newFindings.find((f) => f.id === 'd').severity, 'critical');
});
