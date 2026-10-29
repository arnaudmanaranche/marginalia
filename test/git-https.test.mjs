import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credentialResponse, httpsRewrites } from '../api/src/git-https.mjs';
import { sandboxStatus } from '../api/src/platform-support.mjs';

const BASE = 'https://git.example.com';

test('SSH remotes of the GitLab host are rewritten to its HTTPS origin', () => {
  const rewrites = httpsRewrites(BASE);
  assert.ok(rewrites.every((r) => r.key === 'url.https://git.example.com/.insteadOf'));
  assert.deepEqual(rewrites.map((r) => r.value), ['git@git.example.com:', 'ssh://git@git.example.com/', 'ssh://git@git.example.com:22/']);
});

test('a GitLab on another port keeps it in the HTTPS origin and does not claim ssh port 22', () => {
  const rewrites = httpsRewrites('https://git.example.com:8443/');
  assert.equal(rewrites[0].key, 'url.https://git.example.com:8443/.insteadOf');
  assert.ok(!rewrites.some((r) => r.value.includes(':22/')));
});

test('the credential helper gives the token to the GitLab host over https, and to nobody else', () => {
  const ask = (host, protocol = 'https') => credentialResponse(`protocol=${protocol}\nhost=${host}\n\n`, BASE, 's3cret');
  assert.equal(ask('git.example.com'), 'username=oauth2\npassword=s3cret\n');
  assert.equal(ask('github.com'), '');
  assert.equal(ask('git.example.com.evil.test'), '');
  assert.equal(ask('git.example.com', 'http'), '', 'never in clear text');
  assert.equal(credentialResponse('protocol=https\nhost=git.example.com\n', BASE, ''), '', 'no token, no answer');
});

test('a token containing = is passed whole', () => {
  assert.match(credentialResponse('protocol=https\nhost=git.example.com\n', BASE, 'a=b=c'), /password=a=b=c\n/);
});

test('in the container image doctor says the container is the boundary, on any platform', () => {
  const status = sandboxStatus({ platform: 'linux', sandboxEnabled: false, container: true });
  assert.equal(status.level, 'ok');
  assert.match(status.message, /container/);
  assert.equal(sandboxStatus({ platform: 'linux', sandboxEnabled: false }).level, 'warn', 'outside one it still warns');
});
