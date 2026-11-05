import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../dist/src/db.js';
import { markMention, mentionRunsSince, readCursor, seenMentionIds, writeCursor } from '../dist/src/mention-store.js';
import { intakePass } from '../dist/src/mention-pass.js';
import { memoryGitlab } from './support/memory-gitlab.mjs';

const project = { key: 'app', encodedId: 'app' };
const T0 = '2026-10-30T09:00:00Z';
const note = (id, body, author = 'bob', at = '2026-10-30T10:00:00Z') => ({ id, body, system: false, created_at: at, author: { username: author } });

function setup({ members = { bob: 30 }, dailyCap = 20, mrAuthor = 'bob', threads = [], failRun = false } = {}) {
  const db = openDatabase(':memory:');
  writeCursor(db, 'app', T0);
  const { gitlab, discussions } = memoryGitlab({ me: 'marginalia', members });
  discussions.push(...threads);
  const calls = { review: [], triage: [], answer: [] };
  const deps = {
    bot: 'marginalia', dailyCap, now: () => new Date('2026-10-30T12:00:00Z'),
    openMergeRequests: async () => [{ iid: 7, updated_at: '2026-10-30T10:30:00Z', author: { username: mrAuthor } }],
    listRawDiscussions: gitlab.listRawDiscussions, memberAccessLevel: gitlab.memberAccessLevel, replyToDiscussion: gitlab.replyToDiscussion,
    run: {
      review: async (mr) => { if (failRun) throw new Error('fetch failed'); calls.review.push(mr.iid); },
      triage: async (mr) => { calls.triage.push(mr.iid); },
      answer: async (_mr, m) => { calls.answer.push(m.invocation.text); return 'It is a lock.'; },
    },
    store: {
      seen: (p) => seenMentionIds(db, p), mark: (p, r) => markMention(db, p, r), runsSince: (iso) => mentionRunsSince(db, iso),
      cursor: (p) => readCursor(db, p), setCursor: (p, iso) => writeCursor(db, p, iso),
    },
  };
  const replies = () => discussions.flatMap((d) => d.notes.filter((n) => n.author.username === 'marginalia').map((n) => n.body));
  return { db, deps, calls, replies };
}
const thread = (id, ...notes) => ({ id, notes });

test('the first pass only sets the starting point', async () => {
  const db = openDatabase(':memory:');
  const deps = { now: () => new Date('2026-10-30T12:00:00Z'), store: { cursor: (p) => readCursor(db, p), setCursor: (p, i) => writeCursor(db, p, i) } };
  await intakePass(project, deps);
  assert.equal(readCursor(db, 'app'), '2026-10-30T12:00:00.000Z');
});

test('a mention by a developer runs a review and the bot answers in the thread, once', async () => {
  const { deps, calls, replies, db } = setup({ threads: [thread('d1', note(1, '@marginalia'))] });
  await intakePass(project, deps);
  await intakePass(project, deps);
  assert.deepEqual(calls.review, [7]);
  assert.equal(replies().length, 1);
  assert.match(replies()[0], /reviewed this merge request/);
  assert.equal(readCursor(db, 'app'), '2026-10-30T12:00:00.000Z');
});

test('a question gets the agent answer, a triage only the author of the MR can ask for', async () => {
  const { deps, calls, replies } = setup({ mrAuthor: 'alice', threads: [thread('d1', note(1, '@marginalia why a lock?')), thread('d2', note(2, '@marginalia triage'))] });
  await intakePass(project, deps);
  assert.deepEqual(calls.answer, ['why a lock?']);
  assert.deepEqual(calls.triage, []);
  assert.deepEqual(replies(), ['It is a lock.', 'I only triage the comments on your own merge request: the author can ask me to.']);
});

test('a stranger is told no and nothing runs; the refusal is not repeated', async () => {
  const { deps, calls, replies } = setup({ members: {}, threads: [thread('d1', note(1, '@marginalia'))] });
  await intakePass(project, deps);
  await intakePass(project, deps);
  assert.deepEqual(calls.review, []);
  assert.equal(replies().length, 1);
  assert.match(replies()[0], /Developer role/);
});

test('past the daily cap a mention is refused', async () => {
  const { deps, calls, replies } = setup({ dailyCap: 1, threads: [thread('d1', note(1, '@marginalia')), thread('d2', note(2, '@marginalia why?', 'bob', '2026-10-30T10:05:00Z'))] });
  await intakePass(project, deps);
  assert.equal(calls.review.length, 1);
  assert.deepEqual(calls.answer, []);
  assert.match(replies().at(-1), /limit of runs/);
});

test('two review mentions on one MR become one review', async () => {
  const { deps, calls } = setup({ threads: [thread('d1', note(1, '@marginalia')), thread('d2', note(2, '@marginalia review', 'bob', '2026-10-30T10:05:00Z'))] });
  await intakePass(project, deps);
  assert.deepEqual(calls.review, [7]);
});

test('a failed run is told by its kind, not by the raw error', async () => {
  const { deps, replies } = setup({ failRun: true, threads: [thread('d1', note(1, '@marginalia'))] });
  await intakePass(project, deps, (err) => `the cause: ${err.message.length}`);
  assert.equal(replies()[0], 'I could not do that: the cause: 12.');
});

test('the bot own notes and notes not addressed to it start nothing', async () => {
  const { deps, calls, replies } = setup({ threads: [thread('d1', note(1, 'looks good'), note(2, '@marginalia hi', 'marginalia'))] });
  await intakePass(project, deps);
  assert.deepEqual(calls, { review: [], triage: [], answer: [] });
  assert.deepEqual(replies(), ['@marginalia hi']);
});
