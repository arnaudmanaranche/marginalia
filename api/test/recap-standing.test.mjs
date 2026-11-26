import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commentStanding } from '../dist/src/recap-standing.js';

const note = (over = {}) => ({ mine: false, bot: false, ...over });
const thread = (over = {}) => ({ resolved: false, notes: [note({ mine: true })], ...over });

test('a comment I dropped is dropped, whatever the code did', () => {
  assert.equal(commentStanding({ dropped: true, thread: null, linesChanged: true }).standing, 'dropped');
});

test('changed code is addressed, with or without a thread', () => {
  assert.equal(commentStanding({ thread: thread(), linesChanged: true }).standing, 'addressed');
  assert.equal(commentStanding({ thread: null, linesChanged: true }).standing, 'addressed');
});

test('a resolved thread over changed code is addressed and not flagged', () => {
  const v = commentStanding({ thread: thread({ resolved: true }), linesChanged: true });
  assert.equal(v.standing, 'addressed');
  assert.equal(v.disagreement, false);
});

test('a resolved thread over code known to be untouched is contested and flagged', () => {
  const v = commentStanding({ thread: thread({ resolved: true }), linesChanged: false });
  assert.equal(v.standing, 'contested');
  assert.equal(v.disagreement, true);
});

test('a resolved thread when the code cannot be compared is addressed, with the code unknown', () => {
  const v = commentStanding({ thread: thread({ resolved: true }), linesChanged: null });
  assert.equal(v.standing, 'addressed');
  assert.equal(v.signals.linesChanged, null);
});

test('nothing moved is untouched, and an unknown code state alone never counts as addressed', () => {
  assert.equal(commentStanding({ thread: thread(), linesChanged: false }).standing, 'untouched');
  assert.equal(commentStanding({ thread: thread(), linesChanged: null }).standing, 'untouched');
  assert.equal(commentStanding({ thread: null, linesChanged: null }).standing, 'untouched');
});

test('a reply alone is not an answer: it stays untouched but says it was replied to', () => {
  const v = commentStanding({ thread: thread({ notes: [note({ mine: true }), note()] }), linesChanged: false });
  assert.equal(v.standing, 'untouched');
  assert.equal(v.signals.replied, true);
});

test('my own follow-up and a bot note are not the author replying', () => {
  const t = thread({ notes: [note({ mine: true }), note({ mine: true }), note({ bot: true })] });
  assert.equal(commentStanding({ thread: t, linesChanged: false }).signals.replied, false);
});

test('changed code under an open thread is addressed and not a disagreement: an author often pushes the fix without resolving', () => {
  const v = commentStanding({ thread: thread(), linesChanged: true });
  assert.equal(v.standing, 'addressed');
  assert.equal(v.disagreement, false);
});
