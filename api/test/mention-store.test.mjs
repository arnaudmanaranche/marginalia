import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../dist/src/db.js';
import { markMention, mentionRunsSince, readCursor, seenMentionIds, writeCursor } from '../dist/src/mention-store.js';

test('a note is remembered once per project, whatever came out of it', () => {
  const db = openDatabase(':memory:');
  markMention(db, 'a', { noteId: 1, at: '2026-10-30T10:00:00Z', outcome: 'ran' });
  markMention(db, 'a', { noteId: 1, at: '2026-10-30T11:00:00Z', outcome: 'duplicate' });
  markMention(db, 'b', { noteId: 1, at: '2026-10-30T10:00:00Z', outcome: 'not-a-member' });
  assert.deepEqual([...seenMentionIds(db, 'a')], [1]);
  assert.equal(mentionRunsSince(db, '2026-10-30T00:00:00Z'), 1);
  assert.equal(mentionRunsSince(db, '2026-10-30T10:30:00Z'), 0);
});

test('the cursor of a project is read back, and moves', () => {
  const db = openDatabase(':memory:');
  assert.equal(readCursor(db, 'a'), null);
  writeCursor(db, 'a', '2026-10-30T10:00:00Z');
  writeCursor(db, 'a', '2026-10-30T12:00:00Z');
  assert.equal(readCursor(db, 'a'), '2026-10-30T12:00:00Z');
  assert.equal(readCursor(db, 'b'), null);
});
