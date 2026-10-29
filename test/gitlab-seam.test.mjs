import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// What the bot asks of GitLab goes through lib/gitlab-api.mjs, by MR: the REST client is built
// there and nothing else builds a GitLab URL.
const roots = ['lib', 'lib/pipeline', 'studio', 'scripts', '.'];
const files = roots.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.mjs')).map((f) => join(dir, f)));
const outside = files.filter((f) => !/(^|\/)gitlab[^/]*\.mjs$/.test(f));

test('only the gitlab modules import the REST client or its helpers', () => {
  assert.deepEqual(outside.filter((f) => /gitlab-(client|http)\.mjs/.test(readFileSync(f, 'utf8'))), []);
});

test('only gitlab-api.mjs builds anything from the configured client', () => {
  const users = files.filter((f) => /gitlab-client\.mjs/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(users, ['lib/gitlab-api.mjs']);
});
