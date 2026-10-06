import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEVERITIES, buildShape, findingId, listFields, normalizeSeverity, normalizeVerdict, parseFindingsJson, parseVerdict,
} from '../lib/findings.mjs';

test('verdicts are understood in the ways a command writes them', () => {
  for (const [text, expected] of [
    ['REQUEST CHANGES', 'REQUEST_CHANGES'], ['request_changes', 'REQUEST_CHANGES'], ['Changes requested', 'REQUEST_CHANGES'],
    ['Needs work', 'REQUEST_CHANGES'], ['Demander des modifications', 'REQUEST_CHANGES'], ['Not approved', 'REQUEST_CHANGES'],
    ['APPROVE', 'APPROVE'], ['Approved', 'APPROVE'], ['approve with suggestions', 'APPROVE'], ['LGTM', 'APPROVE'], ['Approuvé', 'APPROVE'],
    ['Comment only', 'OTHER'], ['', null], [null, null],
  ]) assert.equal(normalizeVerdict(text), expected, String(text));
});

test('verdict lines tolerate the usual markdown variations', () => {
  assert.equal(parseVerdict('**Verdict:** APPROVE'), 'APPROVE');
  assert.equal(parseVerdict('**Verdict :** REQUEST CHANGES — see below'), 'REQUEST_CHANGES');
  assert.equal(parseVerdict('**Verdict**: Approve'), 'APPROVE');
  assert.equal(parseVerdict('**Décision :** Demander des changements'), 'REQUEST_CHANGES');
  assert.equal(parseVerdict('no verdict anywhere'), null);
});

test('severity names from other skills map onto the four we use', () => {
  for (const [name, expected] of [['Blocker', 'critical'], ['MAJOR', 'important'], ['nit', 'suggestion'], ['praise', 'info'], ['bloquant', 'critical'], ['whatever', null]]) {
    assert.equal(normalizeSeverity(name), expected, name);
  }
  for (const s of SEVERITIES) assert.equal(normalizeSeverity(s), s);
});

test('a finding keeps its id when the comment is reworded or the findings are reordered', () => {
  const a = { path: 'src/a.ts', title: 'Price mismatch on open', body: 'x' };
  assert.equal(findingId(a), findingId({ ...a, body: 'completely different wording' }));
  assert.equal(findingId(a), findingId({ ...a, title: 'price  mismatch on OPEN!' }), 'case, spacing and punctuation do not matter');
  assert.notEqual(findingId(a), findingId({ ...a, path: 'src/b.ts' }));
  assert.notEqual(findingId(a), findingId({ ...a, title: 'Another point' }));
});

test('ids survive a re-run whose markdown was reworded', () => {
  const run = (comment) => buildShape({
    markdown: `**Verdict:** REQUEST CHANGES\n\n## Critical\n\n- **Price mismatch on open** in \`src/a.ts:4\`.\n\n  > ${comment}\n`,
  }).findings[0];
  const first = run('The price differs.');
  const second = run('On open the price is not the card price; please align them.');
  assert.equal(first.id, second.id);
  assert.notEqual(first.comment, second.comment);
});

test('a findings file with the same id twice gets distinct ids', () => {
  const r = parseFindingsJson(JSON.stringify({ findings: [{ id: 'x', title: 'a' }, { id: 'x', title: 'b' }, { title: 'c' }, { title: 'c' }] }));
  assert.equal(new Set(r.findings.map((f) => f.id)).size, 4);
});

test('a findings file inside a code fence is accepted', () => {
  const r = parseFindingsJson('```json\n{"verdict":"APPROVE","findings":[]}\n```');
  assert.equal(r.ok, true);
  assert.equal(r.verdict, 'APPROVE');
});

test('garbage findings files are rejected with a reason, never thrown', () => {
  for (const raw of ['', 'nope', '[]', '"text"', 'null', '{"findings": 3}']) {
    const r = parseFindingsJson(raw);
    assert.equal(r.ok, false, raw);
    assert.ok(r.error);
  }
});

test('a path named only in the text still anchors the comment', () => {
  const r = parseFindingsJson(JSON.stringify({ findings: [{ title: 'Bug', body: 'In src/x/y.ts:9 the guard is wrong', comment: 'Fix it' }] }));
  assert.deepEqual([r.findings[0].path, r.findings[0].line], ['src/x/y.ts', 9]);
});

test('a line without a path is dropped, so a comment is never anchored on nothing', () => {
  const r = parseFindingsJson(JSON.stringify({ findings: [{ title: 'Bug', line: 3 }] }));
  assert.deepEqual([r.findings[0].path, r.findings[0].line], [null, null]);
});

test('URLs and bare names are not mistaken for repo paths', () => {
  const shape = buildShape({ markdown: '## Critical\n\n- See https://example.com/docs/page.html and Next.js for context.\n' });
  assert.equal(shape.findings[0].path, null);
});

test('findings inside a code fence are not findings', () => {
  const shape = buildShape({ markdown: '## Critical\n\n```md\n## Important\n- fake\n```\n' });
  assert.equal(shape.findings.length, 0);
});

test('the list fields are consistent with the findings', () => {
  const shape = buildShape({
    markdown: 'ignored',
    findingsRaw: JSON.stringify({ verdict: 'REQUEST_CHANGES', findings: [
      { severity: 'critical', title: 'a', comment: 'c1' }, { severity: 'critical', title: 'b' }, { severity: 'critical', title: 'c' },
      { severity: 'important', title: 'd', comment: 'c2' }, { severity: 'suggestion', title: 'e' },
    ] }),
  });
  const f = listFields(shape);
  assert.equal(f.critical, 3);
  assert.equal(f.important, 1);
  assert.equal(f.postable, 2);
  assert.equal(f.highlights.filter((h) => h.severity === 'critical').length, 2, 'at most two highlights per severity');
  assert.equal(f.contract.source, 'json');
});
