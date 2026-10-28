import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextText, parseNumstat } from '../lib/pipeline/context-text.mjs';
import { jsonAnswer, matchesPattern } from '../lib/pipeline/json-answer.mjs';
import { chapterPrompt, mapPrompt, parseChapter, parseMap } from '../lib/pipeline/review-prompts.mjs';
import { mergeReview } from '../lib/pipeline/review-merge.mjs';
import { renderReview } from '../lib/pipeline/report-render.mjs';
import { judgePrompt, parseFix, parseJudge } from '../lib/pipeline/triage-prompts.mjs';

const ctx = {
  mr: { iid: 12, title: 'feat: coupons', author: 'alice', description: 'Adds coupons.', source: 'feat/coupons', target: 'develop', url: null },
  base: 'b1', head: 'h1',
  files: [{ path: 'src/pricing.ts', added: 30, removed: 2 }, { path: 'src/pricing.test.ts', added: 40, removed: 0 }],
  ticket: { key: 'COL-1', summary: 'Coupons', text: 'A coupon takes its percentage off.' },
  guidance: ['CLAUDE.md'], conversation: '', previous: '', stack: '',
};

test('the context names the MR, the ticket, the diff base and the rules files', () => {
  const t = contextText(ctx);
  assert.match(t, /!12 "feat: coupons" by alice: feat\/coupons → develop/);
  assert.match(t, /COL-1: Coupons\nA coupon takes/);
  assert.match(t, /git diff b1 HEAD -- <path>/);
  assert.match(t, /2 files, \+70 -2/);
  assert.match(t, /the standard: CLAUDE\.md/);
  assert.match(contextText({ ...ctx, ticket: { key: 'COL-1', summary: null, text: null } }), /could not read/);
});

test('numstat reads renames as their new path', () => {
  assert.deepEqual(parseNumstat('3\t1\tsrc/a.ts\n-\t-\timg.png\n2\t2\tsrc/{old => new}/b.ts'), [
    { path: 'src/a.ts', added: 3, removed: 1 }, { path: 'img.png', added: 0, removed: 0 }, { path: 'src/new/b.ts', added: 2, removed: 2 },
  ]);
});

test('an answer is read from its last json block, and a glob names a group of files', () => {
  assert.deepEqual(jsonAnswer('draft ```json\n{"a":1}\n``` final ```json\n{"a":2}\n```').value, { a: 2 });
  assert.equal(jsonAnswer('nothing').ok, false);
  assert.ok(matchesPattern('src/**', 'src/a/b.ts'));
  assert.ok(matchesPattern('src/*.ts', 'src/a.ts'));
  assert.ok(!matchesPattern('src/*.ts', 'src/a/b.ts'));
  assert.ok(matchesPattern('src/lib', 'src/lib/x.ts'));
});

const MAP = '```json\n{"overview":{"before":"Coupons were ignored.","after":"A coupon takes its percentage off."},"risk":{"level":"medium","rationale":"Changes totals.","factors":["payments"]},"chapters":[{"title":"A coupon takes its percentage off","summary":"S.","files":["src/pricing.ts"],"check":"Totals never go negative."}]}\n```';

test('a map puts the files it left out in a last chapter, and refuses what does not fit', () => {
  const map = parseMap(MAP, ['src/pricing.ts', 'src/pricing.test.ts']);
  assert.equal(map.ok, true);
  assert.deepEqual(map.value.chapters.map((c) => c.files), [['src/pricing.ts'], ['src/pricing.test.ts']]);
  assert.match(map.value.warnings[0], /1 changed file/);
  assert.match(parseMap('```json\n{"overview":{"before":"a","after":"b"},"risk":{"level":"huge"},"chapters":[]}\n```', []).error, /risk\.level/);
  assert.match(mapPrompt(contextText(ctx)), /Your stage: map the change/);
});

test('a chapter answer keeps the findings that have a title and a known severity', () => {
  const r = parseChapter('```json\n{"findings":[{"id":"neg-total","severity":"important","title":"Total can go negative","path":"src/pricing.ts","line":42,"body":"B","comment":"C"},{"severity":"loud","title":"x"}],"verified":"Rounding is right."}\n```');
  assert.equal(r.value.findings.length, 1);
  assert.equal(r.value.findings[0].line, 42);
  const map = parseMap(MAP, ['src/pricing.ts']).value;
  const p = chapterPrompt({ context: 'CTX', map, chapter: map.chapters[0], index: 0, checklist: '.claude/agents/code-reviewer.md' });
  assert.match(p, /review chapter 1 of 1/);
  assert.match(p, /keeps a review checklist in \.claude\/agents\/code-reviewer\.md/);
});

test('the chapters make one review: deduplicated, unique ids, the verdict from the severities', () => {
  const map = { ...parseMap(MAP, ['src/pricing.ts']).value, chapters: [{ title: 'One', summary: 'S1', files: ['a'] }, { title: 'Two', summary: 'S2', files: ['b'] }, { title: 'Three', summary: 'S3', files: ['c'] }] };
  const f = (over) => ({ id: null, severity: 'suggestion', title: 'Same', body: 'B', path: 'a', line: 1, comment: null, ...over });
  const { data, warnings } = mergeReview({ map, chapters: [
    { result: { findings: [f({}), f({ severity: 'important', title: 'Other' })], verified: 'V' } },
    { result: { findings: [f({}), f({ path: 'b', title: 'Same' })], verified: '' } },
    { result: null, error: 'overloaded' },
  ] });
  assert.equal(data.findings.length, 3);
  assert.deepEqual(data.findings.map((x) => x.id), ['same', 'other', 'same-2']);
  assert.equal(data.verdict, 'REQUEST_CHANGES');
  assert.deepEqual(data.tour[0].findings, ['same', 'other']);
  assert.match(data.tour[2].summary, /could not be reviewed \(overloaded\)/);
  assert.match(data.summary, /3 findings: 1 important, 2 suggestion\. 1 chapter could not be reviewed\./);
  assert.match(warnings.join(), /1 of 3 chapters/);
  const md = renderReview({ title: 'T', iid: 1, branch: 'b' }, data);
  assert.match(md, /\*\*Verdict:\*\* REQUEST CHANGES/);
  assert.match(md, /## Important\n\n- `a:1` \*\*Other\*\*/);
});

const THREADS = [
  { id: 'aaaaaaaa11', path: 'src/a.ts', line: 3, notes: [{ author: 'bob', mine: false, body: 'Rename this.' }], code: '    3> const x = 1;' },
  { id: 'bbbbbbbb22', path: null, line: null, notes: [{ author: 'eve', mine: false, body: 'Why not a flag?' }], code: null },
];

test('the judge sees every thread with its code, and must give each one a verdict', () => {
  const p = judgePrompt({ context: 'CTX', threads: THREADS });
  assert.match(p, /Thread aaaaaaaa11 on src\/a\.ts:3\nbob: Rename this\.\nCode at head:/);
  assert.match(p, /Thread bbbbbbbb22 \(general comment\)/);
  const ids = THREADS.map((t) => t.id);
  const ok = parseJudge('```json\n{"threads":[{"thread":"aaaaaaaa11","verdict":"fix","why":"W","plan":"Rename x."},{"thread":"bbbbbbbb22","verdict":"answer","why":"W","reply":"A flag would hide it."}]}\n```', ids);
  assert.deepEqual(ok.value.map((v) => v.verdict), ['fix', 'answer']);
  assert.match(parseJudge('```json\n{"threads":[{"thread":"aaaaaaaa11","verdict":"fix","why":"W","plan":"P"}]}\n```', ids).error, /no verdict for thread\(s\) bbbbbbbb/);
  assert.match(parseJudge('```json\n{"threads":[{"thread":"aaaaaaaa11","verdict":"fix","why":"W"}]}\n```', ['aaaaaaaa11']).error, /no "plan"/);
  assert.equal(parseFix('```json\n{"changed":true,"what":"Renamed x.","reply":"Renamed it."}\n```').value.changed, true);
});
