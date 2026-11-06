import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LIMITS, verifyLimits } from '../dist/src/verify-limits.js';
import { parseConfig } from '../dist/src/config-schema.js';

test('a verification always has every limit: the defaults, with a project override on top', () => {
  assert.deepEqual(verifyLimits(null), { cpus: 2, memoryMb: 4096, pids: 256, timeoutMinutes: 10 });
  assert.deepEqual(verifyLimits({ verifyLimits: { memoryMb: 2048 } }), { ...DEFAULT_LIMITS, memoryMb: 2048 });
  assert.deepEqual(verifyLimits({ verifyLimits: { cpus: 0, pids: -1 } }), DEFAULT_LIMITS, 'a zero or negative value is no limit: the default stays');
});

test('verification is off until a project opts in, and its limits are bounded', () => {
  const base = { gitlabBaseUrl: 'https://g.example', gitlabUsername: 'me', gitlabToken: 't' };
  const project = { gitlabProjectId: '1', repoLocalPath: '/r' };
  assert.equal(parseConfig({ ...base, projects: [project] }).config.projects[0].verify, false);
  assert.equal(parseConfig({ ...base, projects: [{ ...project, verify: true, verifyLimits: { cpus: 4 } }] }).config.projects[0].verifyLimits.cpus, 4);
  assert.equal(parseConfig({ ...base, projects: [{ ...project, verifyLimits: { memoryMb: 10 } }] }).ok, false);
});

import { verifyChecks } from '../dist/src/verify-checks.js';

test('doctor says what keeps a verification from running, and what stays quiet', () => {
  const recipe = { steps: [{ run: 'x' }], hosts: ['registry.example.org'] };
  const all = verifyChecks({ image: 'img', docker: { stdout: '27.1\n' }, imageProbe: {}, recipe, egress: { network: 'n', proxy: 'p' } });
  assert.deepEqual(all.map((c) => c.level), ['ok', 'ok', 'ok']);
  const bad = verifyChecks({ image: '', docker: { error: 'Cannot connect to the Docker daemon' }, imageProbe: { error: 'x' }, recipe: null, egress: null });
  assert.deepEqual(bad.map((c) => `${c.label}:${c.level}`), ['Docker:warn', 'Runner image:warn', 'Recipe:warn']);
  assert.match(bad[0].detail, /Cannot connect/);
  const offline = verifyChecks({ image: 'img', docker: { stdout: '27' }, imageProbe: { error: 'no such image' }, recipe, egress: null });
  assert.match(offline.find((c) => c.label === 'Runner image').detail, /docker pull/);
  assert.match(offline.at(-1).detail, /stays offline/);
});
