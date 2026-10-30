import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNoteHook, projectOfEvent, tokenMatches } from '../dist/src/webhook.js';
import { createWebhookApp } from '../dist/src/webhook-server.js';
import { createSerial } from '../dist/src/serial.js';
import { intakeNote } from '../dist/src/mention-pass.js';
import { openDatabase } from '../dist/src/db.js';
import { markMention, mentionRunsSince, readCursor, seenMentionIds, writeCursor } from '../dist/src/mention-store.js';
import { memoryGitlab } from './support/memory-gitlab.mjs';

const hook = (over = {}) => ({ object_kind: 'note', project: { id: 5, path_with_namespace: 'group/app' }, merge_request: { iid: 7 }, object_attributes: { id: 11, noteable_type: 'MergeRequest', system: false, note: '@marginalia' }, ...over });

test('the token is compared whole, and an empty one never matches', () => {
  assert.equal(tokenMatches('s3cret', 's3cret'), true);
  assert.equal(tokenMatches('s3cre', 's3cret'), false);
  assert.equal(tokenMatches('', ''), false);
  assert.equal(tokenMatches(undefined, 'x'), false);
});

test('only a note on a merge request is an event, and its project is found by path or id', () => {
  const ev = parseNoteHook(hook());
  assert.deepEqual(ev, { projectId: 5, projectPath: 'group/app', iid: 7, noteId: 11 });
  assert.equal(parseNoteHook(hook({ object_kind: 'push' })), null);
  assert.equal(parseNoteHook(hook({ object_attributes: { id: 1, noteable_type: 'Issue' } })), null);
  assert.equal(parseNoteHook(hook({ object_attributes: { id: 1, noteable_type: 'MergeRequest', system: true } })), null);
  assert.equal(projectOfEvent([{ key: 'a', encodedId: 'group%2Fapp' }], ev)?.key, 'a');
  assert.equal(projectOfEvent([{ key: 'b', encodedId: '5' }], ev)?.key, 'b');
  assert.equal(projectOfEvent([{ key: 'c', encodedId: 'other%2Fapp' }], ev), null);
});

async function post(app, { token = 'sec', event = 'Note Hook', body = hook() } = {}) {
  return app.request('/webhooks/gitlab', { method: 'POST', headers: { 'x-gitlab-token': token, 'x-gitlab-event': event, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

test('the route refuses a wrong token before reading, drops other hooks, and answers at once', async () => {
  const seen = [];
  let release;
  const app = createWebhookApp({ secret: 'sec', onNote: (ev) => new Promise((r) => { seen.push(ev.noteId); release = r; }) });
  assert.equal((await post(app, { token: 'nope', body: '{not json' })).status, 401);
  assert.equal((await post(app, { event: 'Push Hook' })).status, 200);
  assert.deepEqual(seen, []);
  assert.equal((await post(app, { body: '{not json' })).status, 400);
  assert.equal((await post(app)).status, 200, 'acknowledged while the work has not finished');
  assert.deepEqual(seen, [11]);
  release();
  assert.equal((await app.request('/other', { method: 'POST' })).status, 404);
});

test('the serial queue runs one job at a time in order, and goes on after a failure', async () => {
  const serial = createSerial();
  const log = [];
  const slow = serial.run(async () => { log.push('a start'); await new Promise((r) => setTimeout(r, 20)); log.push('a end'); });
  const bad = serial.run(async () => { log.push('b'); throw new Error('x'); });
  const last = serial.run(async () => { log.push('c'); });
  await assert.rejects(bad);
  await Promise.all([slow, last]);
  assert.deepEqual(log, ['a start', 'a end', 'b', 'c']);
});

test('a note announced by webhook and found again by polling runs once', async () => {
  const db = openDatabase(':memory:');
  writeCursor(db, 'app', '2026-10-30T09:00:00Z');
  const { gitlab, discussions } = memoryGitlab({ me: 'marginalia', members: { bob: 30 } });
  discussions.push({ id: 'd1', notes: [{ id: 11, body: '@marginalia', system: false, created_at: '2026-10-30T10:00:00Z', author: { username: 'bob' } }] });
  const reviews = [];
  const deps = {
    bot: 'marginalia', dailyCap: 20, now: () => new Date('2026-10-30T12:00:00Z'),
    listRawDiscussions: gitlab.listRawDiscussions, memberAccessLevel: gitlab.memberAccessLevel, replyToDiscussion: gitlab.replyToDiscussion,
    run: { review: async (mr) => reviews.push(mr.iid), triage: async () => {}, answer: async () => '' },
    store: { seen: (p) => seenMentionIds(db, p), mark: (p, r) => markMention(db, p, r), runsSince: (i) => mentionRunsSince(db, i), cursor: (p) => readCursor(db, p), setCursor: (p, i) => writeCursor(db, p, i) },
  };
  const project = { key: 'app', encodedId: 'app' };
  await intakeNote(project, { iid: 7, author: { username: 'bob' } }, 11, deps);
  await intakeNote(project, { iid: 7, author: { username: 'bob' } }, 11, deps);
  assert.deepEqual(reviews, [7]);
});
