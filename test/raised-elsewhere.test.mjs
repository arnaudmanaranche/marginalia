import { test } from 'node:test';
import assert from 'node:assert/strict';
import { raisedElsewhere } from '../studio/src/lib/raisedElsewhere.ts';

const note = (over = {}) => ({ id: 1, author: 'alice', authorName: 'Alice', mine: false, bot: false, body: 'Null check?', at: '2026-10-01T10:00:00Z', ...over });
const thread = (id, over = {}, opener = {}) => ({ id, path: 'a.ts', line: 10, side: 'new', resolved: false, resolvable: true, outdated: false, notes: [note(opener)], ...over });

test('a thread someone else opened near the finding marks it as already raised', () => {
  const raised = raisedElsewhere({ path: 'a.ts', line: 12 }, [thread('t')]);
  assert.equal(raised.thread.id, 't');
  assert.equal(raised.author, 'Alice');
  assert.equal(raised.body, 'Null check?');
});

test('the nearest of several threads is the one named', () => {
  const raised = raisedElsewhere({ path: 'a.ts', line: 12 }, [thread('far', { line: 9 }), thread('near', { line: 13 })]);
  assert.equal(raised.thread.id, 'near');
});

test('resolved threads and the MR author still count', () => {
  assert.ok(raisedElsewhere({ path: 'a.ts', line: 10 }, [thread('t', { resolved: true }, { author: 'mr-author' })]));
});

test('my own threads, bots, other files, far lines and the old side do not', () => {
  const threads = [
    thread('mine', {}, { mine: true }),
    thread('bot', {}, { bot: true }),
    thread('other', { path: 'b.ts' }),
    thread('far', { line: 20 }),
    thread('old', { side: 'old' }),
  ];
  assert.equal(raisedElsewhere({ path: 'a.ts', line: 10 }, threads), null);
});

test('a finding on the whole file matches a thread on the whole file only', () => {
  assert.equal(raisedElsewhere({ path: 'a.ts', line: null }, [thread('line')]), null);
  assert.equal(raisedElsewhere({ path: 'a.ts', line: null }, [thread('file', { line: null, side: null })]).thread.id, 'file');
  assert.equal(raisedElsewhere({ path: null, line: null }, [thread('file', { path: null, line: null })]), null);
});
