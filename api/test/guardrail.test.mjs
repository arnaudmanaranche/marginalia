import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enforceContract, CONTRACT_BROKEN } from '../dist/src/guardrail.js';
import { failureKind } from '../dist/src/failure-kind.js';

const review = (patch = {}) => JSON.stringify({
  verdict: 'REQUEST_CHANGES',
  summary: 'One bug.',
  overview: { before: 'It ignored the coupon.', after: 'It applies the coupon.' },
  tour: [{ title: 'A coupon takes its percentage off', summary: 'Check the floor.', files: ['src/pricing.ts'], findings: ['neg-total'] }],
  findings: [{ id: 'neg-total', severity: 'important', title: 'Total can go negative', path: 'src/pricing.ts', line: 42, body: 'Why.', comment: 'Ready.' }],
  ...patch,
});

test('a review that follows the contract passes, fenced or not', () => {
  enforceContract('review', review());
  enforceContract('review', `\`\`\`json\n${review()}\n\`\`\``);
});

test('no findings file, bad JSON and a half-written review are failures', () => {
  assert.throws(() => enforceContract('review', null), /no findings file/);
  assert.throws(() => enforceContract('review', '{nope'), /not valid JSON/);
  assert.throws(() => enforceContract('review', review({ overview: undefined })), /overview/);
  assert.throws(() => enforceContract('review', review({ tour: [] })), /tour/);
  assert.throws(() => enforceContract('review', review({ verdict: 'OTHER' })), /verdict/);
});

test('a finding must be anchored properly and the tour may only name real findings', () => {
  const finding = { severity: 'info', title: 't', body: 'b' };
  assert.throws(() => enforceContract('review', review({ findings: [{ ...finding, line: 3 }], tour: [{ title: 'a', summary: 'b', files: ['x'] }] })), /needs a path/);
  assert.throws(() => enforceContract('review', review({ tour: [{ title: 'a', summary: 'b', files: ['x'], findings: ['ghost'] }] })), /ghost/);
});

test('APPROVE cannot leave a critical or important finding', () => {
  assert.throws(() => enforceContract('review', review({ verdict: 'APPROVE' })), /APPROVE/);
});

test('a triage needs a reply per thread, in the allowed verdicts', () => {
  const reply = { thread: 'abcdef1234', verdict: 'answered', reply: 'Done.', resolve: false };
  enforceContract('triage', JSON.stringify({ replies: [reply] }));
  assert.throws(() => enforceContract('triage', JSON.stringify({ replies: [] })), /replies/);
  assert.throws(() => enforceContract('triage', JSON.stringify({ replies: [{ ...reply, verdict: 'maybe' }] })), /replies\.0\.verdict/);
});

test('a broken contract is shown as its own failure', () => {
  try { enforceContract('review', null); } catch (err) {
    assert.ok(err.message.startsWith(CONTRACT_BROKEN));
    assert.equal(failureKind(err.message).kind, 'contract');
  }
});
