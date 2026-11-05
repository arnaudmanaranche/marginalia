import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discussionPrompt, triageDiscussionPrompt } from '../dist/src/discussion-prompt.js';

test('the conversation prompt carries replies and says who spoke', () => {
  assert.equal(discussionPrompt([]), '');
  const text = discussionPrompt([{ path: 'a.ts', line: 3, resolved: false, notes: [{ mine: true, author: 'me', body: 'Check this' }, { mine: false, author: 'dev', body: 'Fixed in abc' }] }]);
  assert.match(text, /a\.ts:3/);
  assert.match(text, /me \(the reviewer\): Check this/);
  assert.match(text, /dev: Fixed in abc/);
});

test('a triage gets only the unresolved threads, with me as the MR author', () => {
  const text = triageDiscussionPrompt([
    { id: 'abc123def456', path: 'a.ts', line: 3, resolved: false, notes: [{ mine: false, author: 'rev', body: 'Rename this' }, { mine: true, author: 'me', body: 'Why?' }] },
    { path: 'b.ts', line: 9, resolved: true, notes: [{ mine: false, author: 'rev', body: 'Done already' }] },
  ]);
  assert.match(text, /Thread abc123def456 on a\.ts:3/, 'each thread carries its id for the reply');
  assert.match(text, /rev: Rename this/);
  assert.match(text, /me \(the MR author\): Why\?/);
  assert.doesNotMatch(text, /Done already/);
  assert.match(triageDiscussionPrompt([]), /no unresolved thread/);
});
