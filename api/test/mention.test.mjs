import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMentions, invocationOf, textAfterMention } from '../dist/src/mention.js';
import { decideMention, mergeQueued } from '../dist/src/mention-guardrail.js';

const note = (id, body, over = {}) => ({ id, body, system: false, created_at: `2026-10-30T10:0${id}:00Z`, author: { username: 'bob' }, ...over });

test('the bot is addressed as a whole word, not inside code, a quote or another name', () => {
  assert.equal(textAfterMention('@marginalia', 'marginalia'), '');
  assert.equal(textAfterMention('Hi @Marginalia, review please', 'marginalia'), 'Hi, review please');
  assert.equal(textAfterMention('@marginalia-bot review', 'marginalia'), null);
  assert.equal(textAfterMention('mail me@marginalia.com', 'marginalia'), null);
  assert.equal(textAfterMention('see `@marginalia`', 'marginalia'), null);
  assert.equal(textAfterMention('> @marginalia review\nok', 'marginalia'), null);
  assert.equal(textAfterMention('```\n@marginalia\n```', 'marginalia'), null);
});

test('a bare mention or review asks for a review, triage for a triage, the rest is a question', () => {
  assert.deepEqual(invocationOf(''), { kind: 'review' });
  assert.deepEqual(invocationOf('Review!'), { kind: 'review' });
  assert.deepEqual(invocationOf('triage'), { kind: 'triage' });
  assert.deepEqual(invocationOf('why is this a lock?'), { kind: 'question', text: 'why is this a lock?' });
});

test('mentions come out oldest first; bot, system and old notes are skipped', () => {
  const discussions = [
    { id: 'd1', notes: [note(2, '@marginalia triage'), note(3, '@marginalia', { system: true }), note(4, '@marginalia hi', { author: { username: 'ci', bot: true } })] },
    { id: 'd2', notes: [note(1, '@marginalia why?'), note(5, '@marginalia old', { created_at: '2026-10-29T10:00:00Z' })] },
  ];
  const found = findMentions(discussions, { bot: 'marginalia', since: Date.parse('2026-10-30T00:00:00Z') });
  assert.deepEqual(found.map((m) => [m.noteId, m.invocation.kind]), [[1, 'question'], [2, 'triage']]);
});

test('a reply under one of the bot notes is a follow-up without a mention; elsewhere it is nothing', () => {
  const found = findMentions([
    { id: 'd1', notes: [note(1, '@marginalia why?'), note(2, 'Here is the answer', { author: { username: 'marginalia' } }), note(3, 'and the second case?')] },
    { id: 'd2', notes: [note(4, 'just a comment')] },
  ], { bot: 'marginalia' });
  assert.deepEqual(found.map((m) => [m.noteId, m.invocation.kind]), [[1, 'question'], [3, 'followup']]);
});

test('a thread started from the studio is never a follow-up, even when its notes carry the bot account (local mode)', () => {
  const found = findMentions([
    { id: 'd1', notes: [note(1, 'Consider a guard here', { author: { username: 'marginalia' } }), note(2, 'why though?'), note(3, 'agreed')] },
  ], { bot: 'marginalia' });
  assert.deepEqual(found, []);
});

test('a studio thread stays silent, but a mention inside it is still an ask and what follows is a follow-up', () => {
  const found = findMentions([
    { id: 'd1', notes: [note(1, 'Consider a guard here', { author: { username: 'marginalia' } }), note(2, 'why?'), note(3, '@marginalia explain'), note(4, 'Because...', { author: { username: 'marginalia' } }), note(5, 'thanks, and the edge case?')] },
  ], { bot: 'marginalia' });
  assert.deepEqual(found.map((m) => [m.noteId, m.invocation.kind]), [[3, 'question'], [5, 'followup']]);
});

const mention = (noteId, kind = 'review') => ({ noteId, discussionId: 'd', author: 'bob', at: 'x', invocation: { kind, text: 't' } });
const standing = (over = {}) => ({ seenNoteIds: new Set(), accessLevel: 30, runsToday: 0, dailyCap: 20, ...over });

test('guardrails apply in order: duplicate, membership, then the daily cap', () => {
  assert.deepEqual(decideMention(mention(1), standing()), { action: 'run' });
  assert.deepEqual(decideMention(mention(1), standing({ seenNoteIds: new Set([1]), accessLevel: 0 })), { action: 'ignore', reason: 'duplicate' });
  assert.deepEqual(decideMention(mention(1), standing({ accessLevel: 20 })), { action: 'ignore', reason: 'not-a-member' });
  assert.deepEqual(decideMention(mention(1), standing({ runsToday: 20 })), { action: 'ignore', reason: 'daily-cap' });
});

test('mentions found together become one follow-up: one review, then the questions in order', () => {
  const merged = mergeQueued([mention(1, 'question'), mention(2, 'review'), mention(3, 'review'), mention(4, 'question')]);
  assert.deepEqual(merged.map((m) => m.noteId), [2, 1, 4]);
});
