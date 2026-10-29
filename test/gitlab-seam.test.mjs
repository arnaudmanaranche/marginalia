import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The REST client and the MR path are internal to the gitlab*.mjs modules: the rest of the bot
// asks them for an operation by name and never builds a GitLab URL.
const roots = ['lib', 'lib/pipeline', 'studio', 'scripts', '.'];
const files = roots.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.mjs')).map((f) => join(dir, f)));

test('only the gitlab modules import the REST client', () => {
  const offenders = files.filter((f) => !/(^|\/)gitlab[^/]*\.mjs$/.test(f) && /gitlab-client\.mjs/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('the transport helpers are not exported by gitlab.mjs', () => {
  assert.doesNotMatch(readFileSync('lib/gitlab.mjs', 'utf8'), /export\s+(const|function)\s+(gitlabRequest|gitlabPaginate|mrPath)\b|export\s*\{[^}]*\b(gitlabRequest|gitlabPaginate|mrPath)\b/);
});
