import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
process.env.ALLOWED_TARGET_BRANCHES = 'develop, main';
process.env.EXCLUDE_AUTHORS = 'Alice';
process.env.STALE_AFTER_DAYS = '10';
const dir = await mkdtemp(join(tmpdir(), 'marginalia-settings-'));
process.env.REPO_LOCAL_PATH = dir;
process.env.SETTINGS_FILE = join(dir, 'settings.json');

const { SETTINGS_FILE } = await import('../api/src/config.mjs');
const { loadSettings, saveSettings, allowedTargets, excludedAuthors, staleAfterDays } = await import('../api/src/settings.mjs');

// What a project says in the config: the default of the lists until the studio overrides them.
const project = { allowedTargetBranches: ['develop', 'main'], excludeAuthors: ['Alice'] };

test('without settings.json, the project gives the values', () => {
  assert.deepEqual(allowedTargets(project), ['develop', 'main']);
  assert.ok(excludedAuthors(project).has('alice'));
  assert.equal(staleAfterDays(), 10);
});

test('a saved value wins at once and only the changed keys are written', async () => {
  await saveSettings({ staleAfterDays: 3, allowedTargetBranches: [] });
  assert.equal(staleAfterDays(), 3);
  assert.deepEqual(allowedTargets(project), []);
  assert.ok(excludedAuthors(project).has('alice'));
  assert.deepEqual(JSON.parse(await readFile(SETTINGS_FILE, 'utf8')), { staleAfterDays: 3, allowedTargetBranches: [] });
});

test('null puts a key back on its .env default', async () => {
  await saveSettings({ allowedTargetBranches: null });
  assert.deepEqual(loadSettings().allowedTargetBranches, ['develop', 'main']);
});

test('invalid input is refused and nothing changes', async () => {
  await assert.rejects(saveSettings({ staleAfterDays: 0 }), /staleAfterDays/);
  await assert.rejects(saveSettings({ excludeAuthors: ['a b'] }), /excludeAuthors/);
  await assert.rejects(saveSettings({ allowPosting: true }), /unknown setting/);
  assert.equal(staleAfterDays(), 3);
});

test('showFullDiff defaults to true, can be turned off and must be a boolean', async () => {
  assert.equal(loadSettings().showFullDiff, true);
  assert.equal((await saveSettings({ showFullDiff: false })).showFullDiff, false);
  await assert.rejects(saveSettings({ showFullDiff: 'no' }), /true or false/);
  assert.equal((await saveSettings({ showFullDiff: null })).showFullDiff, true);
});
