import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewId, parseReviewId, projectOfUpload } from '../lib/review-id.mjs';

const projects = [{ key: 'back', gitlabProjectId: 'g/back' }, { key: 'front', gitlabProjectId: 'g/front' }];

test('an id is the project key and the slug', () => {
  assert.equal(reviewId(projects[1], 'feat-x'), 'front/feat-x');
  assert.deepEqual(parseReviewId('front/feat-x', projects), { project: projects[1], slug: 'feat-x' });
});

test('unknown projects, bare slugs and path tricks are refused', () => {
  for (const id of ['nope/feat-x', 'feat-x', '/feat-x', 'back/', 'back/../x', 'back/a/b', 'back/a b', 42, null]) {
    assert.equal(parseReviewId(id, projects), null, String(id));
  }
});

test('an upload URL belongs to the project in its path, else the first project', () => {
  assert.equal(projectOfUpload('/g/front/uploads/abc/x.png', projects).key, 'front');
  assert.equal(projectOfUpload('/-/project/9/uploads/abc/x.png', projects).key, 'back');
});
