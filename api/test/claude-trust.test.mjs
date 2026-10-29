import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTrust } from '../dist/src/claude-trust.js';

test('the listed repos become trusted, everything else in the file is kept', () => {
  const before = { numStartups: 4, projects: { '/other': { hasTrustDialogAccepted: false, allowedTools: ['x'] } } };
  const { config, added } = withTrust(before, ['/repos/webapp', '/other']);
  assert.deepEqual(added, ['/repos/webapp', '/other']);
  assert.equal(config.numStartups, 4);
  assert.equal(config.projects['/repos/webapp'].hasTrustDialogAccepted, true);
  assert.deepEqual(config.projects['/other'], { hasTrustDialogAccepted: true, allowedTools: ['x'] });
  assert.equal(before.projects['/other'].hasTrustDialogAccepted, false, 'the input is not modified');
});

test('a repo that is already trusted is left alone and not reported', () => {
  const { added, config } = withTrust({ projects: { '/r': { hasTrustDialogAccepted: true, extra: 1 } } }, ['/r']);
  assert.deepEqual(added, []);
  assert.equal(config.projects['/r'].extra, 1);
});

test('a config without projects gets them', () => {
  assert.deepEqual(withTrust({}, ['/r']).config, { projects: { '/r': { hasTrustDialogAccepted: true } } });
});
