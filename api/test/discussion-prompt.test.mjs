import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discussionPrompt } from '../dist/src/discussion-prompt.js';

test('the conversation prompt carries replies and says who spoke', () => {
  assert.equal(discussionPrompt([]), '');
  const text = discussionPrompt([{ path: 'a.ts', line: 3, resolved: false, notes: [{ mine: true, author: 'me', body: 'Check this' }, { mine: false, author: 'dev', body: 'Fixed in abc' }] }]);
  assert.match(text, /a\.ts:3/);
  assert.match(text, /me \(the reviewer\): Check this/);
  assert.match(text, /dev: Fixed in abc/);
});
