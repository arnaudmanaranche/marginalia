import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCase } from '../dist/scripts/eval-score.js';
import { evalUploadConfig, promptVersionOf } from '../dist/scripts/eval-upload.js';

const f = (over) => ({ id: 'x', severity: 'important', title: 'Money as a float', path: 'src/invoice.mjs', line: 7, body: 'It returns euros as a float.', comment: null, ...over });
const byName = (scores) => Object.fromEntries(scores.map((s) => [s.scorer, s.pass]));
const planted = { planted: { path: 'src/invoice.mjs', lines: [7, 7] }, cites: ['0003'] };

test('a run without a review fails the contract and nothing else is scored', () => {
  assert.deepEqual(scoreCase(planted, null, 'boom'), [{ scorer: 'contract_valid', pass: false, why: 'boom' }]);
});

test('the planted problem found but without its rule is generic: cites_repo_rule fails', () => {
  const s = byName(scoreCase(planted, { findings: [f()] }));
  assert.equal(s.found_planted, true);
  assert.equal(s.cites_repo_rule, false);
  assert.equal(s.no_critical_on_clean, null);
});

test('a finding that names the ADR it breaks passes, a suggestion elsewhere does not count', () => {
  const s = byName(scoreCase(planted, { findings: [f({ body: 'ADR 0003 says money is integer cents.' })] }));
  assert.equal(s.cites_repo_rule, true);
  const far = byName(scoreCase(planted, { findings: [f({ line: 40, body: 'See ADR 0003.' })] }));
  assert.equal(far.found_planted, false);
  assert.equal(far.cites_repo_rule, false);
});

test('a clean change: no critical, and nothing louder than the ceiling', () => {
  const expect = { planted: null, maxSeverity: 'suggestion' };
  assert.deepEqual(byName(scoreCase(expect, { findings: [f({ severity: 'suggestion' })] })), { contract_valid: true, found_planted: null, no_critical_on_clean: true, cites_repo_rule: null, no_generic_noise: true, verification_ok: null });
  const loud = byName(scoreCase(expect, { findings: [f({ severity: 'important' })] }));
  assert.equal(loud.no_generic_noise, false);
  assert.equal(loud.no_critical_on_clean, true);
});

test('verification is scored only where the case expects it', () => {
  const run = { verification: { status: 'reproduced', evidence: 'e' } };
  assert.equal(byName(scoreCase({ planted: null, verification: 'none' }, { findings: [f(run)] })).verification_ok, false);
  assert.equal(byName(scoreCase({ ...planted, verification: 'reproduced' }, { findings: [f(run)] })).verification_ok, true);
});

test('the upload names the methods of the run and says what it is missing', () => {
  assert.equal(promptVersionOf({ 'review-map': null, 'review-chapter': 4 }), 'review-chapter@4,review-map@built-in');
  assert.equal(promptVersionOf(null), 'unknown');
  assert.match(evalUploadConfig({}).problem, /POSTHOG_EVAL_KEY, POSTHOG_PROJECT_ID/);
  assert.deepEqual(evalUploadConfig({ POSTHOG_EVAL_KEY: 'phs_x', POSTHOG_PROJECT_ID: '12', POSTHOG_HOST: 'https://us.i.posthog.com' }), { secretKey: 'phs_x', projectId: 12, host: 'https://us.posthog.com' });
});

test('naming where the code should go is not citing the rule: only its source counts', () => {
  const expect = { planted: { path: 'src/mailer.mjs', lines: [3, 3] }, cites: ['CLAUDE.md'] };
  const finding = { id: 'env', severity: 'important', path: 'src/mailer.mjs', line: 3 };
  assert.equal(byName(scoreCase(expect, { findings: [{ ...finding, title: 'MAIL_FROM is read here instead of src/config.mjs', body: 'Move it to src/config.mjs.' }] })).cites_repo_rule, false);
  assert.equal(byName(scoreCase(expect, { findings: [{ ...finding, title: 'MAIL_FROM is read here', body: 'CLAUDE.md says settings are read in src/config.mjs only.' }] })).cites_repo_rule, true);
});
