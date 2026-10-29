import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failureKind } from '../api/src/failure-kind.mjs';

// Messages real runs printed (container logs, October 2026).
const SEEN = {
  network: [
    "Command failed: git fetch --quiet origin merge-requests/3983/head\nfatal: unable to access 'https://git.worldia.com/platform/webapp.git/': Could not resolve host: git.worldia.com\n",
    'fetch failed: Connect Timeout Error (attempted address: git.worldia.com:443, timeout: 10000ms)',
    'webapp: fetch failed',
    'fetch failed: getaddrinfo EAI_AGAIN git.worldia.com',
  ],
  claude_busy: ['claude exited with code 1: API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'],
  claude_login: ['claude exited with code 1: Invalid API key · Please run /login'],
  gitlab_auth: ['GitLab API GET /projects/1/merge_requests failed: 401 Unauthorized'],
  git: ['error: Your local changes to the following files would be overwritten by checkout:\n\tsrc/a.ts'],
};

test('each failure seen in real runs is told apart', () => {
  for (const [kind, messages] of Object.entries(SEEN)) {
    for (const m of messages) assert.equal(failureKind(m).kind, kind, m.slice(0, 80));
  }
});

test('what passes by itself is retried soon, the rest needs a person or the doctor', () => {
  assert.equal(failureKind(SEEN.network[0]).transient, true);
  assert.equal(failureKind(SEEN.claude_busy[0]).transient, true);
  assert.equal(failureKind(SEEN.claude_login[0]).transient, false);
});

test('an unknown failure says the doctor will look', () => {
  const f = failureKind('TypeError: Cannot read properties of undefined (reading "tour")');
  assert.equal(f.kind, 'unknown');
  assert.match(f.advice, /doctor/);
  assert.equal(failureKind(null).kind, 'unknown');
});
