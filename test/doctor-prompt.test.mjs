import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doctorPrompt, parseDoctorAnswer } from '../api/src/doctor-prompt.mjs';

const trace = {
  id: 'r1', kind: 'review', iid: 12, project: 'webapp', command: '/code-review',
  startedAt: 't0', endedAt: 't1', error: 'TypeError: x is undefined',
  stages: [{ label: 'Claude reviews the MR', state: 'failed', startedAt: 't0', endedAt: 't1' }],
  steps: [{ at: 't0', stage: 'agent', sub: true, text: 'Reading a.ts' }],
};

test('the doctor is given the run, where the code is, and the answer it must give', () => {
  const p = doctorPrompt({ trace, transcript: '{"type":"result"}', sourceDir: '/app', agentDirs: ['/repo/.claude'] });
  assert.match(p, /MR !12 \(webapp\)/);
  assert.match(p, /TypeError: x is undefined/);
  assert.match(p, /\(sub-agent\) Reading a\.ts/);
  assert.match(p, /source is in \/app/);
  assert.match(p, /\/repo\/\.claude/);
  assert.match(p, /"retryWillWork"/);
});

test('an answer is read from its json block and checked', () => {
  const answer = parseDoctorAnswer('Here it is:\n```json\n{"summary":"The report parser choked.","cause":"No tour.","where":"bot","confidence":"high","evidence":["lib/report.mjs:40"],"retryWillWork":false,"fix":{"inBot":true,"what":"Accept a report with no tour.","files":["lib/report.mjs"]}}\n```');
  assert.equal(answer.where, 'bot');
  assert.equal(answer.fix.inBot, true);
  assert.deepEqual(answer.fix.files, ['lib/report.mjs']);
});

test('a malformed answer is refused, and unknown values fall back safely', () => {
  assert.equal(parseDoctorAnswer('no json here'), null);
  assert.equal(parseDoctorAnswer('```json\n{"summary":"x"}\n```'), null);
  const loose = parseDoctorAnswer('{"summary":"s","cause":"c","where":"mars","confidence":"sure","fix":"yes"}');
  assert.equal(loose.where, 'bot');
  assert.equal(loose.confidence, 'low');
  assert.equal(loose.fix.inBot, false);
});
