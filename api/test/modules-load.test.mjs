// Every module of lib/ and the studio server loads: a duplicate import or declaration is a
// SyntaxError that only shows when the module is imported, and some (the runner) are imported
// by no other test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
process.env.MARGINALIA_DB = ':memory:';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = [
  ...readdirSync(join(root, 'dist', 'src'), { recursive: true }).map(String).filter((f) => f.endsWith('.js')).map((f) => join(root, 'dist', 'src', f)),
];

test('every module of the api package loads', async () => {
  for (const file of modules) {
    await assert.doesNotReject(import(file), file);
  }
});

test('every module of the contract package loads', async () => {
  const dir = join(root, '..', 'packages', 'contract', 'dist');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) await assert.doesNotReject(import(join(dir, f)), f);
});
