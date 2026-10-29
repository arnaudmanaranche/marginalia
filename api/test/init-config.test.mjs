import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv, projectFromAnswers, buildConfig, defaultsFromEnv, migrateEnv } from '../src/init-config.mjs';
import { parseConfig } from '../src/config-schema.mjs';

const shared = { gitlabBaseUrl: 'https://git.example.com/', gitlabUsername: 'me', gitlabToken: 'glpat-abc' };

test('an answer set becomes a project entry, with empty answers left out', () => {
  const entry = projectFromAnswers({ gitlabProjectId: ' group/back ', repoLocalPath: '/code/back', kind: 'back', reviewCommand: '/review', triageCommand: '', allowedTargetBranches: 'develop, main', excludeAuthors: '' });
  assert.deepEqual(entry, {
    gitlabProjectId: 'group/back', repoLocalPath: '/code/back', kind: 'back', reviewCommand: '/review', triageCommand: '', allowedTargetBranches: ['develop', 'main'],
  });
});

test('"something else" has no kind, an unanswered triage command keeps the default, key and authors are kept', () => {
  const entry = projectFromAnswers({ gitlabProjectId: '7', repoLocalPath: '/r', kind: 'other', key: 'api', excludeAuthors: ['bot'] });
  assert.deepEqual(entry, { gitlabProjectId: '7', repoLocalPath: '/r', key: 'api', excludeAuthors: ['bot'] });
});

test('two projects make a config the schema accepts', () => {
  const projects = [
    projectFromAnswers({ gitlabProjectId: 'g/back', repoLocalPath: '/b', kind: 'back' }),
    projectFromAnswers({ gitlabProjectId: 'g/front', repoLocalPath: '/f', kind: 'front', reviewCommand: '/review-front' }),
  ];
  const built = buildConfig({ shared, projects });
  assert.equal(built.ok, true);
  const parsed = parseConfig(built.raw);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.config.gitlabBaseUrl, 'https://git.example.com');
  assert.deepEqual(parsed.config.projects.map((p) => p.kind), ['back', 'front']);
});

test('buildConfig reports what is wrong, and keeps the keys of an existing file', () => {
  assert.equal(buildConfig({ shared, projects: [] }).ok, false);
  const twice = buildConfig({ shared, projects: [{ gitlabProjectId: 'a', repoLocalPath: '/a' }, { gitlabProjectId: 'a', repoLocalPath: '/b' }] });
  assert.match(twice.errors.join(), /listed twice/);
  const kept = buildConfig({ shared, projects: [{ gitlabProjectId: 'a', repoLocalPath: '/a' }], previous: { studioPort: 5000, sandbox: false } });
  assert.equal(kept.raw.studioPort, 5000);
  assert.equal(kept.raw.sandbox, false);
});

test('a custom claude binary is written, the default is not', () => {
  const projects = [{ gitlabProjectId: 'a', repoLocalPath: '/a' }];
  assert.equal(buildConfig({ shared: { ...shared, claudeBin: '/opt/claude' }, projects }).raw.claudeBin, '/opt/claude');
  assert.ok(!('claudeBin' in buildConfig({ shared: { ...shared, claudeBin: 'claude' }, projects }).raw));
});

const ENV = `GITLAB_BASE_URL=https://git.example.com
GITLAB_PROJECT_ID=group/back
GITLAB_TOKEN=glpat-real
GITLAB_USERNAME=me
REPO_LOCAL_PATH=/code/back
REVIEW_COMMAND=/review
TRIAGE_COMMAND=
ALLOWED_TARGET_BRANCHES=develop,main
STUDIO_PORT=5555
CLAUDE_SANDBOX=false
BOT_WORKTREE_DIR=/w
# GITLAB_TOKEN=commented
`;

test('parseEnv reads KEY=value lines only', () => {
  const env = parseEnv(ENV);
  assert.equal(env.GITLAB_PROJECT_ID, 'group/back');
  assert.equal(env.TRIAGE_COMMAND, '');
  assert.equal(env.GITLAB_TOKEN, 'glpat-real');
});

test('migrate maps the .env to one project and lists what stays in the .env', () => {
  const r = migrateEnv(parseEnv(ENV));
  assert.equal(r.ok, true);
  assert.deepEqual(r.raw.projects, [{
    gitlabProjectId: 'group/back', repoLocalPath: '/code/back', reviewCommand: '/review', triageCommand: '', allowedTargetBranches: ['develop', 'main'], excludeAuthors: [],
  }]);
  assert.equal(r.raw.studioPort, '5555');
  assert.equal(r.raw.sandbox, false);
  assert.equal(parseConfig(r.raw).config.studioPort, 5555);
  assert.deepEqual(r.stillInEnv, ['BOT_WORKTREE_DIR']);
});

test('migrate refuses an incomplete .env with the schema paths', () => {
  const r = migrateEnv({ GITLAB_BASE_URL: 'https://x' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.startsWith('gitlabToken')));
  assert.ok(r.errors.some((e) => e.startsWith('projects.0.repoLocalPath')));
});

test('the legacy WEBAPP_LOCAL_PATH still migrates', () => {
  const r = migrateEnv({ ...parseEnv(ENV), REPO_LOCAL_PATH: '', WEBAPP_LOCAL_PATH: '/old' });
  assert.equal(r.raw.projects[0].repoLocalPath, '/old');
});

test('prompt defaults come from the .env, and the template token is not offered', () => {
  const d = defaultsFromEnv(parseEnv(ENV));
  assert.equal(d.gitlabToken, 'glpat-real');
  assert.equal(d.project.allowedTargetBranches, 'develop,main');
  assert.equal(defaultsFromEnv({ GITLAB_TOKEN: 'glpat-xxxx' }).gitlabToken, undefined);
  assert.doesNotThrow(() => defaultsFromEnv({}));
});
