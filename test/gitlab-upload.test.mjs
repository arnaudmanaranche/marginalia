import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadFetchPath } from '../api/src/gitlab-upload.mjs';

const BASE = 'https://gitlab.example.com';
const SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

test('a relative project upload maps to the project-id upload route', () => {
  assert.equal(uploadFetchPath(`/uploads/${SECRET}/shot.png`, BASE, '42'), `/-/project/42/uploads/${SECRET}/shot.png`);
});

test('an absolute upload URL of the same GitLab is accepted, with its group path', () => {
  assert.equal(uploadFetchPath(`${BASE}/grp/proj/uploads/${SECRET}/a%20b.png`, BASE, '42'), `/-/project/42/uploads/${SECRET}/a%20b.png`);
});

test('a path-style project id keeps the project path', () => {
  assert.equal(uploadFetchPath(`/uploads/${SECRET}/x.png`, BASE, 'grp/proj'), `/grp/proj/uploads/${SECRET}/x.png`);
});

test('other hosts and non-upload paths are refused', () => {
  assert.equal(uploadFetchPath(`https://evil.example/uploads/${SECRET}/x.png`, BASE, '42'), null);
  assert.equal(uploadFetchPath('/api/v4/user', BASE, '42'), null);
  assert.equal(uploadFetchPath('not a url', 'nope', '42'), null);
});
