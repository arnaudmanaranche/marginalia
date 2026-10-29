import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// What the bot asks of GitLab goes through src/gitlab-api.ts, by MR: the REST client is built
// there and nothing else builds a GitLab URL.
const roots = ['src', 'src/pipeline', 'src/http', 'scripts', '.'];
const files = roots.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => join(dir, f)));
const outside = files.filter((f) => !/(^|\/)gitlab[^/]*\.ts$/.test(f));

test('only the gitlab modules import the REST client or its helpers', () => {
  assert.deepEqual(outside.filter((f) => /gitlab-(client|http)\.ts/.test(readFileSync(f, 'utf8'))), []);
});

test('only gitlab-api.ts builds anything from the configured client', () => {
  const users = files.filter((f) => /gitlab-client\.ts/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(users, ['src/gitlab-api.ts']);
});
