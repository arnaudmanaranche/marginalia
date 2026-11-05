import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftsOf } from '../dist/src/gitlab-draft-ops.js';
import { readsOf } from '../dist/src/gitlab-reads.js';
import { mentionOpsOf } from '../dist/src/gitlab-mention-ops.js';
import { versionsOf } from '../dist/src/gitlab-version-ops.js';
import { memoryGitlab } from './support/memory-gitlab.mjs';

const project = { key: 'app', encodedId: 'group%2Fapp' };

test('the in-memory adapter has exactly the interface of the REST one', () => {
  const rest = Object.keys({ ...readsOf({}, 'me'), ...draftsOf({}), ...versionsOf({}), ...mentionOpsOf({}) }).sort();
  assert.deepEqual(Object.keys(memoryGitlab().gitlab).sort(), rest);
});

test('a draft is private until published, then it is a note of mine', async () => {
  const { gitlab, discussions } = memoryGitlab();
  const { id } = await gitlab.createDraftNote(project, 7, 'hello');
  assert.deepEqual((await gitlab.listDraftNotes(project, 7)).map((d) => d.id), [id]);
  assert.equal(await gitlab.findPublishedNoteId(project, 7, 'hello'), null);
  await gitlab.publishDraftNotes(project, 7);
  assert.deepEqual(await gitlab.listDraftNotes(project, 7), []);
  assert.equal(discussions.length, 1);
  assert.ok(await gitlab.findPublishedNoteId(project, 7, 'hello'));
});

test('GitLab refuses what callers branch on: a line outside the diff, a gone draft, a moved head', async () => {
  const { gitlab } = memoryGitlab({ diffLines: { 'a.js': [2] } });
  await assert.rejects(gitlab.createInlineDraftNote(project, 7, 'x', 'a.js', 9), / -> 400:/);
  await gitlab.createInlineDraftNote(project, 7, 'x', 'a.js', 2);
  await assert.rejects(gitlab.deleteDraftNote(project, 7, 1), / -> 404:/);
  await assert.rejects(gitlab.approveMergeRequest(project, 7, 'old'), / -> 409:/);
  await gitlab.approveMergeRequest(project, 7, 'head1');
});

test('a member is found by exact username, a stranger has no access, a reply lands in the thread', async () => {
  const { gitlab, discussions, seedThread } = memoryGitlab({ members: { bob: 30 } });
  assert.equal(await gitlab.memberAccessLevel(project, 'bob'), 30);
  assert.equal(await gitlab.memberAccessLevel(project, 'mallory'), 0);
  const threadId = seedThread({ author: 'bob', body: 'hi' });
  await gitlab.replyToDiscussion(project, 7, threadId, 'answer');
  assert.equal(discussions.find((d) => d.id === threadId).notes.at(-1).body, 'answer');
  await assert.rejects(gitlab.replyToDiscussion(project, 7, 'nope', 'x'), / -> 404:/);
});
