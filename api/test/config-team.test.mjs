import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyTeam, readTeamSync, teamEnv } from '../dist/src/config-team.js';
import { readConfigFile } from '../dist/src/config-file.js';

// A data dir holding a synced copy of the shipped example team.
function dataDirWithTeam() {
  const dir = mkdtempSync(join(tmpdir(), 'marginalia-team-cfg-'));
  mkdirSync(join(dir, 'team'));
  cpSync(new URL('../examples/team', import.meta.url), join(dir, 'team'), { recursive: true });
  return dir;
}
const dev = (projects) => ({ gitlabBaseUrl: 'https://git.example.com', gitlabUsername: 'me', gitlabToken: 't', projects });

test('no team copy means no team: the config is read as written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'marginalia-team-cfg-'));
  assert.equal(readTeamSync(dir), null);
  const raw = dev([{ gitlabProjectId: 'g/a', repoLocalPath: '/r' }]);
  assert.equal(applyTeam(raw, null), raw);
  assert.deepEqual(teamEnv(null), {});
});

test('a team that needs a newer Marginalia, or an invalid one, is not applied', () => {
  const dir = dataDirWithTeam();
  const file = join(dir, 'team', 'team.json');
  const example = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(readTeamSync(dir, '1.0.0'), 'the example is fine for the version it names');
  writeFileSync(file, JSON.stringify({ ...example, minMarginalia: '5.0.0' }));
  assert.equal(readTeamSync(dir, '2.0.0'), null);
  writeFileSync(file, '{nope');
  assert.equal(readTeamSync(dir, '99.0.0'), null);
});

test('the team fills what the dev left out, and the dev keeps what they set', () => {
  const dir = dataDirWithTeam();
  const team = readTeamSync(dir, '99.0.0');
  assert.ok(team, 'the shipped example is a valid team');
  const [teamProject] = team.projects;
  const mine = { gitlabProjectId: teamProject.gitlabProjectId, repoLocalPath: '/code/mine', reviewCommand: '/my-review' };
  writeFileSync(join(dir, 'config.json'), JSON.stringify(dev([mine])));
  const config = readConfigFile(dir, { team });
  const project = config.projects[0];
  assert.equal(project.repoLocalPath, '/code/mine');
  assert.equal(project.reviewCommand, '/my-review', 'the dev\'s own command wins');
  assert.equal(project.kind, teamProject.kind ?? undefined, 'a field only the team knows comes from it');
});

test('without the team, the same config.json parses to the built-in defaults', () => {
  const dir = dataDirWithTeam();
  writeFileSync(join(dir, 'config.json'), JSON.stringify(dev([{ gitlabProjectId: 'g/a', repoLocalPath: '/r' }])));
  assert.equal(readConfigFile(dir).projects[0].reviewCommand, '/code-review');
});

test('team extras: tools are added to the dev\'s, the dev\'s prompt extra wins', () => {
  const team = { defaults: { claudeExtraAllowedTools: ['mcp__x__y'], reviewPromptExtra: 'team words' }, projects: [] };
  assert.deepEqual(teamEnv(team, { CLAUDE_EXTRA_ALLOWED_TOOLS: 'mine', REVIEW_PROMPT_EXTRA: '' }), { CLAUDE_EXTRA_ALLOWED_TOOLS: 'mine mcp__x__y', REVIEW_PROMPT_EXTRA: 'team words' });
  assert.equal(teamEnv(team, { REVIEW_PROMPT_EXTRA: 'mine' }).REVIEW_PROMPT_EXTRA, 'mine');
});
