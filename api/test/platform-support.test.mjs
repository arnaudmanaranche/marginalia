import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sandboxStatus, notifierAdvice } from '../src/platform-support.mjs';
import { updatePlan } from '../src/update-plan.mjs';

test('macOS is sandboxed unless CLAUDE_SANDBOX is off', () => {
  assert.equal(sandboxStatus({ platform: 'darwin', sandboxEnabled: true }).level, 'ok');
  assert.match(sandboxStatus({ platform: 'darwin', sandboxEnabled: false }).message, /not confined/);
});

test('other platforms say plainly that runs are not sandboxed, and suggest a container', () => {
  for (const sandboxEnabled of [true, false]) {
    const s = sandboxStatus({ platform: 'linux', sandboxEnabled });
    assert.equal(s.level, 'warn');
    assert.match(s.message, /NOT sandboxed on linux/);
    assert.match(s.message, /container/);
  }
});

test('the optional notifier depends on the platform', () => {
  assert.equal(notifierAdvice('darwin').bin, 'terminal-notifier');
  assert.equal(notifierAdvice('linux').bin, 'notify-send');
  assert.equal(notifierAdvice('win32'), null);
});

test('update: a clone is left to git, a packaged install is reinstalled with npm', () => {
  assert.equal(updatePlan({ isClone: true, packageName: '@worldia/marginalia' }).run, null);
  assert.deepEqual(updatePlan({ isClone: false, packageName: '@worldia/marginalia' }).run, ['npm', ['install', '-g', '@worldia/marginalia@latest']]);
});
