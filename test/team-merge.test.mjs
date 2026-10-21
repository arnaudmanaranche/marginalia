import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTeam } from '../lib/team-merge.mjs';
import { parseConfig } from '../lib/config-schema.mjs';

const dev = (projects, extra = {}) => ({ gitlabBaseUrl: 'https://g.example', gitlabUsername: 'me', gitlabToken: 't', projects, ...extra });
const team = (defaults, projects = []) => ({ defaults, projects });
const back = { gitlabProjectId: 'acme/back', repoLocalPath: '/r/back' };

test('built-in default applies when neither dev nor team set a field', () => {
  const { config } = mergeTeam(dev([back]), team({}));
  assert.equal(parseConfig(config).config.projects[0].reviewCommand, '/code-review');
});

test('team defaults beat the built-in defaults', () => {
  const { config, fromTeam } = mergeTeam(dev([back]), team({ reviewCommand: '/t:review', excludeAuthors: ['bot'] }));
  const p = parseConfig(config).config.projects[0];
  assert.equal(p.reviewCommand, '/t:review');
  assert.deepEqual(p.excludeAuthors, ['bot']);
  assert.deepEqual(fromTeam.map((f) => [f.field, f.source]), [['reviewCommand', 'team defaults'], ['excludeAuthors', 'team defaults']]);
});

test('the team project entry beats the team defaults', () => {
  const t = team({ reviewCommand: '/default', allowedTargetBranches: ['develop'] }, [{ gitlabProjectId: 'acme/back', reviewCommand: '/specific', kind: 'back', key: 'api' }]);
  const { config, fromTeam } = mergeTeam(dev([back]), t);
  const p = config.projects[0];
  assert.equal(p.reviewCommand, '/specific');
  assert.deepEqual(p.allowedTargetBranches, ['develop']);
  assert.equal(p.kind, 'back');
  assert.equal(p.key, 'api');
  assert.equal(fromTeam.find((f) => f.field === 'reviewCommand').source, 'team project');
});

test('the dev beats everything, including an explicit empty triageCommand and empty list', () => {
  const mine = { ...back, reviewCommand: '/mine', triageCommand: '', excludeAuthors: [], kind: 'front' };
  const t = team({ reviewCommand: '/d', triageCommand: '/mr-comments', excludeAuthors: ['bot'] }, [{ gitlabProjectId: 'acme/back', reviewCommand: '/p', kind: 'back' }]);
  const { config, fromTeam } = mergeTeam(dev([mine]), t);
  assert.deepEqual(config.projects[0], mine);
  assert.deepEqual(fromTeam, []);
});

test('team defaults reach a dev project the team does not list', () => {
  const { config } = mergeTeam(dev([{ ...back, gitlabProjectId: 'other/thing' }]), team({ allowedTargetBranches: ['develop'] }));
  assert.deepEqual(config.projects[0].allowedTargetBranches, ['develop']);
});

test('a team project is added only when mapped: the others are listed as unmapped', () => {
  const t = team({}, [{ gitlabProjectId: 'acme/back' }, { gitlabProjectId: 'acme/front', key: 'front' }]);
  const { config, unmapped } = mergeTeam(dev([back]), t);
  assert.equal(config.projects.length, 1);
  assert.deepEqual(unmapped.map((p) => p.gitlabProjectId), ['acme/front']);
  assert.equal(mergeTeam(dev([back, { ...back, gitlabProjectId: 'acme/front' }]), t).unmapped.length, 0);
});

test('inputs are not mutated and lists are copied', () => {
  const d = dev([back]);
  const t = team({ excludeAuthors: ['bot'] });
  const before = JSON.stringify([d, t]);
  const { config } = mergeTeam(d, t);
  config.projects[0].excludeAuthors.push('x');
  assert.equal(JSON.stringify([d, t]), before);
});

test('no team at all leaves the config untouched', () => {
  const d = dev([back]);
  const r = mergeTeam(d, null);
  assert.deepEqual(r.config, d);
  assert.deepEqual([r.fromTeam, r.unmapped], [[], []]);
});

test('globals: dev prompt extra wins, team tools are added to the dev ones', () => {
  const defaults = { reviewPromptExtra: 'team text', claudeExtraAllowedTools: ['mcp__a', 'mcp__b'] };
  const mine = mergeTeam(dev([back]), team(defaults), { env: { REVIEW_PROMPT_EXTRA: 'mine', CLAUDE_EXTRA_ALLOWED_TOOLS: 'mcp__b mcp__c' } }).globals;
  assert.equal(mine.reviewPromptExtra, 'mine');
  assert.equal(mine.reviewPromptExtraFromTeam, false);
  assert.deepEqual(mine.claudeExtraAllowedTools, ['mcp__b', 'mcp__c', 'mcp__a']);
  assert.deepEqual(mine.teamAllowedTools, ['mcp__a']);
  const bare = mergeTeam(dev([back]), team(defaults)).globals;
  assert.equal(bare.reviewPromptExtra, 'team text');
  assert.equal(bare.reviewPromptExtraFromTeam, true);
});
