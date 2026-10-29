import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  MR_REVIEW_BOT_SKIP_CONFIG_CHECK: '1',
  GITLAB_BASE_URL: 'https://gl.test/',
  GITLAB_TOKEN: 'tok',
  GITLAB_PROJECT_ID: 'group/app',
  GITLAB_USERNAME: 'me',
});
const realFetch = globalThis.fetch;
after(() => { globalThis.fetch = realFetch; });

const { gitlab } = await import('../src/gitlab-api.mjs');
const { createDraftNote, createInlineDraftNote, publishDraftNotes, updateDraftNote, deleteDraftNote, draftNoteExists, listDraftNotes, approveMergeRequest, mergeRequestNoteExists } = gitlab;

const reply = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Map(Object.entries(headers)),
  json: async () => body,
  text: async () => JSON.stringify(body),
});
let calls;
function route(handler) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = { method: init.method ?? 'GET', path: url.replace('https://gl.test/api/v4', ''), body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    return handler(call);
  };
}
const project = { key: 'app', encodedId: 'group%2Fapp' };
const P = '/projects/group%2Fapp/merge_requests/7';
beforeEach(() => route(() => reply(200, {})));

test('a general draft is POSTed to draft_notes', async () => {
  await createDraftNote(project, 7, 'hello');
  assert.deepEqual(calls, [{ method: 'POST', path: `${P}/draft_notes`, body: { note: 'hello' } }]);
});

test('an inline draft reads the MR refs and diffs, then POSTs the note with its position', async () => {
  const diff = '@@ -1,2 +1,2 @@\n a\n+b\n';
  route((call) => {
    if (call.path === P) return reply(200, { diff_refs: { base_sha: 'b', start_sha: 's', head_sha: 'h' } });
    if (call.path.startsWith(`${P}/diffs`)) return reply(200, [{ old_path: 'f.js', new_path: 'f.js', diff }]);
    return reply(200, {});
  });
  await createInlineDraftNote(project, 7, 'note', 'f.js', 2);
  const post = calls.at(-1);
  assert.equal(post.method, 'POST');
  assert.equal(post.path, `${P}/draft_notes`);
  assert.equal(post.body.note, 'note');
  assert.equal(post.body.position.new_path, 'f.js');
  assert.equal(post.body.position.head_sha, 'h');
});

test('publishing is a POST to bulk_publish, with the reviewer state only when given', async () => {
  await publishDraftNotes(project, 7);
  await publishDraftNotes(project, 7, 'requested_changes');
  assert.deepEqual(calls, [
    { method: 'POST', path: `${P}/draft_notes/bulk_publish`, body: undefined },
    { method: 'POST', path: `${P}/draft_notes/bulk_publish`, body: { reviewer_state: 'requested_changes' } },
  ]);
});

test('an update is a PUT and a delete a DELETE on the draft', async () => {
  await updateDraftNote(project, 7, 42, 'edited');
  await deleteDraftNote(project, 7, 42);
  assert.deepEqual(calls, [
    { method: 'PUT', path: `${P}/draft_notes/42`, body: { note: 'edited' } },
    { method: 'DELETE', path: `${P}/draft_notes/42`, body: undefined },
  ]);
});

test('approving POSTs the reviewed sha, or an empty body without one', async () => {
  await approveMergeRequest(project, 7, 'abc');
  await approveMergeRequest(project, 7);
  assert.deepEqual(calls.map((c) => [c.method, c.path, c.body]), [
    ['POST', `${P}/approve`, { sha: 'abc' }],
    ['POST', `${P}/approve`, {}],
  ]);
});

test('the drafts list reads every page', async () => {
  route((call) => (call.path.endsWith('page=1') ? reply(200, [{ id: 1, note: 'a' }], { 'x-next-page': '2' }) : reply(200, [{ id: 2, note: 'b' }])));
  assert.equal((await listDraftNotes(project, 7)).length, 2);
  assert.deepEqual(calls.map((c) => c.path), [`${P}/draft_notes?per_page=100&page=1`, `${P}/draft_notes?per_page=100&page=2`]);
});

test('a 404 means the draft or note is gone; any other failure throws', async () => {
  route(() => reply(404, { message: '404 Not found' }));
  assert.equal(await draftNoteExists(project, 7, 1), false);
  assert.equal(await mergeRequestNoteExists(project, 7, 1), false);
  route(() => reply(403, { message: 'forbidden' }));
  await assert.rejects(() => draftNoteExists(project, 7, 1), /-> 403/);
  await assert.rejects(() => mergeRequestNoteExists(project, 7, 1), /-> 403/);
  route(() => reply(200, { id: 1 }));
  assert.equal(await draftNoteExists(project, 7, 1), true);
});
