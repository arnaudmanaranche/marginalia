import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commentVerdict } from '../dist/src/recap-verdict.js';

const note = (over = {}) => ({ mine: false, bot: false, ...over });
const thread = (over = {}) => ({ resolved: false, notes: [note({ mine: true })], ...over });

test('a comment I dropped is dropped, whatever the code did', () => {
  assert.equal(commentVerdict({ dropped: true, thread: null, linesChanged: true }).verdict, 'dropped');
});

test('changed code is addressed, with or without a thread', () => {
  assert.equal(commentVerdict({ thread: thread(), linesChanged: true }).verdict, 'addressed');
  assert.equal(commentVerdict({ thread: null, linesChanged: true }).verdict, 'addressed');
});

test('a resolved thread over changed code is addressed and not flagged', () => {
  const v = commentVerdict({ thread: thread({ resolved: true }), linesChanged: true });
  assert.equal(v.verdict, 'addressed');
  assert.equal(v.disagreement, false);
});

test('a resolved thread over code known to be untouched is contested and flagged', () => {
  const v = commentVerdict({ thread: thread({ resolved: true }), linesChanged: false });
  assert.equal(v.verdict, 'contested');
  assert.equal(v.disagreement, true);
});

test('a resolved thread when the code cannot be compared is addressed, with the code unknown', () => {
  const v = commentVerdict({ thread: thread({ resolved: true }), linesChanged: null });
  assert.equal(v.verdict, 'addressed');
  assert.equal(v.signals.linesChanged, null);
});

test('nothing moved is untouched, and an unknown code state alone never counts as addressed', () => {
  assert.equal(commentVerdict({ thread: thread(), linesChanged: false }).verdict, 'untouched');
  assert.equal(commentVerdict({ thread: thread(), linesChanged: null }).verdict, 'untouched');
  assert.equal(commentVerdict({ thread: null, linesChanged: null }).verdict, 'untouched');
});

test('a reply alone is not an answer: it stays untouched but says it was replied to', () => {
  const v = commentVerdict({ thread: thread({ notes: [note({ mine: true }), note()] }), linesChanged: false });
  assert.equal(v.verdict, 'untouched');
  assert.equal(v.signals.replied, true);
});

test('my own follow-up and a bot note are not the author replying', () => {
  const t = thread({ notes: [note({ mine: true }), note({ mine: true }), note({ bot: true })] });
  assert.equal(commentVerdict({ thread: t, linesChanged: false }).signals.replied, false);
});

test('changed code under an open thread is addressed and not a disagreement: an author often pushes the fix without resolving', () => {
  const v = commentVerdict({ thread: thread(), linesChanged: true });
  assert.equal(v.verdict, 'addressed');
  assert.equal(v.disagreement, false);
});
