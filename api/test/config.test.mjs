import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseConfig } from '../src/config-schema.mjs';
import { configFromEnv, envFromConfig } from '../src/config-env.mjs';
import { readConfigFile } from '../src/config-file.mjs';

const ENV = {
  GITLAB_BASE_URL: 'https://git.example.com/', GITLAB_USERNAME: 'me', GITLAB_TOKEN: 'glpat-x',
  GITLAB_PROJECT_ID: 'group/back', REPO_LOCAL_PATH: '/repos/back',
  EXCLUDE_AUTHORS: 'bot, ci', ALLOWED_TARGET_BRANCHES: 'develop',
};

test('a legacy .env maps to a valid one-project config', () => {
  const result = parseConfig(configFromEnv(ENV));
  assert.equal(result.ok, true);
  assert.equal(result.config.gitlabBaseUrl, 'https://git.example.com');
  assert.deepEqual(result.config.projects[0].excludeAuthors, ['bot', 'ci']);
  assert.equal(result.config.projects[0].reviewCommand, '/code-review');
  assert.equal(result.config.studioPort, 4477);
  assert.equal(result.config.sandbox, true);
});

test('the legacy WEBAPP_LOCAL_PATH and VIEWER_PORT names are still read', () => {
  const { REPO_LOCAL_PATH, ...rest } = ENV;
  const { config } = parseConfig(configFromEnv({ ...rest, WEBAPP_LOCAL_PATH: '/old', VIEWER_PORT: '5000' }));
  assert.equal(config.projects[0].repoLocalPath, '/old');
  assert.equal(config.studioPort, 5000);
});

test('an empty TRIAGE_COMMAND disables triage and is kept empty', () => {
  const { config } = parseConfig(configFromEnv({ ...ENV, TRIAGE_COMMAND: '' }));
  assert.equal(config.projects[0].triageCommand, '');
});

test('errors name the field that is wrong', () => {
  const result = parseConfig(configFromEnv({ ...ENV, GITLAB_PROJECT_ID: '' }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /projects\.0\.gitlabProjectId/);
});

test('teamRepo is optional, trimmed, and an empty one is refused', () => {
  assert.equal(parseConfig(configFromEnv(ENV)).config.teamRepo, undefined);
  const raw = configFromEnv(ENV);
  assert.equal(parseConfig({ ...raw, teamRepo: ' git@git.example.com:acme/team.git ' }).config.teamRepo, 'git@git.example.com:acme/team.git');
  assert.equal(parseConfig({ ...raw, teamRepo: '' }).ok, false);
});

test('the same GitLab project cannot be listed twice', () => {
  const raw = configFromEnv(ENV);
  raw.projects.push({ ...raw.projects[0] });
  assert.equal(parseConfig(raw).ok, false);
});

test('envFromConfig round-trips what the rest of the code reads', () => {
  const { config } = parseConfig(configFromEnv(ENV));
  const env = envFromConfig(config);
  assert.equal(env.GITLAB_PROJECT_ID, 'group/back');
  assert.equal(env.EXCLUDE_AUTHORS, 'bot,ci');
  assert.equal(env.CLAUDE_SANDBOX, 'true');
});

test('config.json: absent gives null, valid gives the config, invalid throws with the path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'marginalia-cfg-'));
  assert.equal(readConfigFile(dir), null);
  const raw = configFromEnv(ENV);
  writeFileSync(join(dir, 'config.json'), JSON.stringify(raw));
  assert.equal(readConfigFile(dir).projects[0].gitlabProjectId, 'group/back');
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ ...raw, projects: [] }));
  assert.throws(() => readConfigFile(dir), /config\.json is invalid/);
  writeFileSync(join(dir, 'config.json'), '{nope');
  assert.throws(() => readConfigFile(dir), /not valid JSON/);
});

test('a container can still set the global settings: real environment variables beat config.json\'s defaults', async () => {
  const { envOverrides } = await import('../src/config-env.mjs');
  const fromFile = envFromConfig(parseConfig(configFromEnv(ENV)).config);
  assert.equal(fromFile.CLAUDE_SANDBOX, 'true', 'the file alone says true (the schema default)');
  const env = { ...fromFile, ...envOverrides({ CLAUDE_SANDBOX: 'false', STUDIO_PORT: '', NOTIFICATIONS: undefined, GITLAB_TOKEN: 'ignored' }) };
  assert.equal(env.CLAUDE_SANDBOX, 'false');
  assert.equal(env.STUDIO_PORT, fromFile.STUDIO_PORT, 'an empty variable is not an override');
  assert.equal(env.GITLAB_TOKEN, fromFile.GITLAB_TOKEN, 'only the four global settings can be overridden');
});
