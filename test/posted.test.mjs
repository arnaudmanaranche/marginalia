import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../api/src/db.mjs';
import { postedRecord } from '../api/src/posted.mjs';

// The posted record across its interface only, on an in-memory database.
const fresh = () => {
  const db = openDatabase(':memory:');
  return postedRecord(() => db);
};
const draft = (over = {}) => ({ iid: 5, draftId: 11, body: 'Rename this', mrUrl: 'https://g/mr/5', url: 'https://g/mr/5', ...over });

test('a recorded comment is found again, so it is not posted twice', () => {
  const posted = fresh();
  assert.equal(posted.find('back', 'feat-x', 'c1'), undefined);
  const entry = posted.recordDraft('back', 'feat-x', 'c1', draft());
  assert.equal(entry.state, 'draft');
  assert.deepEqual(posted.find('back', 'feat-x', 'c1'), entry);
  assert.equal(posted.find('front', 'feat-x', 'c1'), undefined, 'another project has its own');
});

test('the drafts of one review are listed, the published and the others are not', () => {
  const posted = fresh();
  posted.recordDraft('back', 'feat-x', 'c1', draft());
  posted.recordDraft('back', 'feat-x', 'c2', draft({ draftId: 12 }));
  posted.recordDraft('back', 'feat-y', 'c1', draft({ draftId: 13 }));
  posted.publish('back/feat-x:c2', 'https://g/mr/5#note_9');
  assert.deepEqual(posted.draftsOf('back', 'feat-x').map((d) => d.key), ['back/feat-x:c1']);
});

test('publishing keeps the comment, drops its draft id and sets the deep link', () => {
  const posted = fresh();
  posted.recordDraft('back', 'feat-x', 'c1', draft());
  posted.publish('back/feat-x:c1', 'https://g/mr/5#note_9', '2026-01-01T00:00:00Z');
  assert.deepEqual(posted.find('back', 'feat-x', 'c1'), { at: '2026-01-01T00:00:00Z', state: 'published', iid: 5, body: 'Rename this', mrUrl: 'https://g/mr/5', url: 'https://g/mr/5#note_9' });
});

test('an edited draft keeps its new text, a deleted one can be posted again', () => {
  const posted = fresh();
  posted.recordDraft('back', 'feat-x', 'c1', draft());
  assert.equal(posted.editDraft('back', 11, 5, 'Better text'), true);
  assert.equal(posted.find('back', 'feat-x', 'c1').body, 'Better text');
  assert.equal(posted.editDraft('back', 99, 5, 'x'), false, 'not a recorded draft');
  assert.equal(posted.editDraft('back', 11, 6, 'x'), false, 'another MR');
  assert.equal(posted.forgetDraft('back', 11, 5), true);
  assert.equal(posted.find('back', 'feat-x', 'c1'), undefined);
});

test('a published comment is not touched as a draft', () => {
  const posted = fresh();
  posted.recordDraft('back', 'feat-x', 'c1', draft());
  posted.publish('back/feat-x:c1', 'u');
  assert.equal(posted.editDraft('back', 11, 5, 'x'), false);
  assert.equal(posted.forgetDraft('back', 11, 5), false);
});

test('entries say their project, and forget removes one row only', () => {
  const posted = fresh();
  posted.recordDraft('back', 'a', 'c1', draft());
  posted.recordDraft('front', 'b', 'c1', draft({ draftId: 12 }));
  assert.deepEqual(posted.entries().map((e) => e.projectKey).sort(), ['back', 'front']);
  posted.forget('back/a:c1');
  assert.deepEqual(Object.keys(posted.all()), ['front/b:c1']);
});
