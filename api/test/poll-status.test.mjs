import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commentsEntry } from '../src/poll-status.mjs';

test('a triage of my own MR records its branch, which the studio checks and pushes the fixes to', () => {
  const mr = { project: { key: 'webapp' }, iid: 3994, title: 't', web_url: 'u', author: { username: 'me' }, source_branch: 'chore/x', target_branch: 'develop', updated_at: 'now' };
  const entry = commentsEntry(mr, { pending: false, reviewPath: '/r.md', reviewedAtMs: null, myState: null });
  assert.equal(entry.sourceBranch, 'chore/x');
  assert.equal(entry.targetBranch, 'develop');
});
