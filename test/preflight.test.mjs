import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockedError, branchCheck, checkLine, claudeCheck, gitlabCheck, jiraCheck, pushCheck } from '../api/src/preflight-checks.mjs';
import { failureKind, needsDoctor } from '../api/src/failure-kind.mjs';
import { identityOf } from '../api/src/git-identity.mjs';

test('Claude: logged in goes on, logged out stops the run, an old CLI that cannot tell goes on', () => {
  assert.equal(claudeCheck({ stdout: '{"loggedIn":true,"authMethod":"claude.ai"}' }).level, 'ok');
  assert.equal(claudeCheck({ stdout: '{"loggedIn":false}', error: 'exit 1' }).level, 'block');
  assert.equal(claudeCheck({ error: 'spawn claude ENOENT' }).level, 'block');
  assert.equal(claudeCheck({ error: "error: unknown command 'auth'" }).level, 'warn');
});

test('GitLab and the MR head on origin must answer', () => {
  assert.equal(gitlabCheck({ project: { path_with_namespace: 'platform/webapp' } }).detail, 'the token reads platform/webapp');
  assert.equal(gitlabCheck({ error: 'GitLab API /projects/1 -> 401: {"message":"401 Unauthorized"}' }).level, 'block');
  assert.equal(branchCheck({ stdout: 'abc1234def\trefs/merge-requests/7/head\n', iid: 7 }).level, 'ok');
  assert.match(branchCheck({ stdout: '', iid: 7 }).detail, /no head for !7/);
  assert.equal(branchCheck({ error: 'fatal: unable to access', iid: 7 }).level, 'block');
});

test('push access: a refused push still proves it, a refused login does not', () => {
  assert.equal(pushCheck({ error: ' ! [rejected]        HEAD -> feat/x (non-fast-forward)', branch: 'feat/x' }).level, 'ok');
  assert.equal(pushCheck({ stdout: 'Everything up-to-date', branch: 'feat/x' }).level, 'ok');
  const denied = pushCheck({ error: 'remote: You are not allowed to push code to this project.\nfatal: unable to access: The requested URL returned error: 403', branch: 'feat/x' });
  assert.equal(denied.level, 'warn');
  assert.match(denied.detail, /fixes stay in the bot's local ref/);
});

test('the ticket never stops a run, but says what the agents will miss', () => {
  assert.equal(jiraCheck({ key: null, enabled: false }).level, 'ok');
  assert.match(jiraCheck({ key: 'COL-1', enabled: false }).detail, /cannot read COL-1/);
  assert.equal(jiraCheck({ key: 'COL-1', enabled: true, error: 'Jira /issue/COL-1 -> 404' }).level, 'warn');
  assert.equal(jiraCheck({ key: 'COL-1', enabled: true }).level, 'ok');
});

test('a blocked preflight is sorted like the failure it is, and needs no doctor', () => {
  const checks = [claudeCheck({ stdout: '{"loggedIn":false}' }), jiraCheck({ key: null, enabled: false })];
  assert.equal(checkLine(checks[0]), '✗ Claude: Claude is not logged in on this machine');
  const error = blockedError(checks);
  assert.equal(failureKind(error).kind, 'claude_login');
  assert.equal(failureKind(blockedError([branchCheck({ stdout: '', iid: 7 })])).kind, 'preflight');
  assert.equal(failureKind(blockedError([gitlabCheck({ error: 'GitLab API /projects/1 -> 401: x' })])).kind, 'gitlab_auth');
  assert.equal(blockedError([jiraCheck({ key: 'COL-1', enabled: false })]), null);
  assert.equal(needsDoctor(failureKind(error)), false);
  assert.equal(needsDoctor(failureKind('no report')), true);
  assert.equal(needsDoctor(failureKind('ECONNRESET')), false, 'a transient failure is retried, not diagnosed');
});

test('fixes are committed as the GitLab user, unless an identity of your own is set', () => {
  const user = { name: 'Arnaud', username: 'am', email: 'am@worldia.com', commit_email: 'commit@worldia.com' };
  assert.deepEqual(identityOf({}, user), { name: 'Arnaud', email: 'commit@worldia.com' });
  assert.deepEqual(identityOf({ MARGINALIA_GIT_EMAIL: 'marginalia@localhost', MARGINALIA_GIT_NAME: 'Marginalia' }, user), { name: 'Arnaud', email: 'commit@worldia.com' }, 'the container default is no choice');
  assert.deepEqual(identityOf({ MARGINALIA_GIT_EMAIL: 'bot@worldia.com', MARGINALIA_GIT_NAME: 'Bot' }, user), { name: 'Bot', email: 'bot@worldia.com' });
  assert.equal(identityOf({}, null), null);
});
