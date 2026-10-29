import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProjects, deriveKey } from '../api/src/project.mjs';

const base = { reviewCommand: '/r', triageCommand: '', allowedTargetBranches: [], excludeAuthors: [] };
const build = (projects) => buildProjects({ projects: projects.map((p) => ({ ...base, ...p })) }, { dataDir: '/data', legacyWorktreeDir: '/legacy/wt' });

test('the key comes from the last segment of the GitLab path', () => {
  assert.equal(deriveKey('group/sub/Back End'), 'back-end');
  assert.equal(deriveKey('123'), 'p123');
});

test('two projects named alike get distinct keys', () => {
  const keys = build([{ gitlabProjectId: 'a/app', repoLocalPath: '/r/1' }, { gitlabProjectId: 'b/app', repoLocalPath: '/r/2' }]).map((p) => p.key);
  assert.deepEqual(keys, ['app', 'app-2']);
});

test('an explicit key is kept and must be unique', () => {
  assert.equal(build([{ gitlabProjectId: 'a/x', repoLocalPath: '/r', key: 'back' }])[0].key, 'back');
  assert.throws(() => build([{ gitlabProjectId: 'a/x', repoLocalPath: '/r', key: 'k' }, { gitlabProjectId: 'a/y', repoLocalPath: '/r2', key: 'k' }]), /used twice/);
});

test('the first project keeps the legacy worktree, the others get their own', () => {
  const [one, two] = build([{ gitlabProjectId: 'g/back', repoLocalPath: '/r/back' }, { gitlabProjectId: 'g/front', repoLocalPath: '/r/front' }]);
  assert.equal(one.worktreeDir, '/legacy/wt');
  assert.equal(two.worktreeDir, '/data/worktrees/front');
  assert.equal(two.reviewsDir, '/r/front/.claude/reviews');
});

test('a path id is URL-encoded for the API, a numeric one is not', () => {
  const [p, q] = build([{ gitlabProjectId: 'g/back', repoLocalPath: '/r/1' }, { gitlabProjectId: '42', repoLocalPath: '/r/2' }]);
  assert.equal(p.encodedId, 'g%2Fback');
  assert.equal(q.encodedId, '42');
});
