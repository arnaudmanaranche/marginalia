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
