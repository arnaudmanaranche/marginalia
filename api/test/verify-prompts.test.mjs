import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseVerification, recipeText, verifyPrompt } from '../dist/src/pipeline/verify-prompts.js';
import { copyWorktree } from '../dist/src/pipeline/verify-copy.js';

const recipe = { steps: [{ purpose: 'test', run: 'run the tests', summary: 'The unit tests.' }], notes: 'Use a fake key.' };

test('the verify prompt names the claim, the recipe and the three outcomes', () => {
  const p = verifyPrompt({ context: 'CTX', finding: { severity: 'important', title: 'Total below zero', path: 'a.ts', line: 3, body: 'A 150% coupon.' }, chapter: { title: 'Coupons', summary: 'S.' }, recipe });
  assert.match(p, /\[important\] Total below zero \(a\.ts:3\)/);
  assert.match(p, /- test: `run the tests`/);
  assert.match(p, /There is no network/);
  assert.match(p, /reproduced.*not_reproduced.*inconclusive/s);
  assert.match(recipeText({ ...recipe, hosts: ['registry.example.org'] }), /reaches only: registry\.example\.org/);
});

test('a verification answer needs one of three outcomes and its evidence', () => {
  const ok = parseVerification('```json\n{"status":"Not-Reproduced","evidence":"It printed 0.","command":"run the tests x"}\n```');
  assert.equal(ok.value.status, 'not_reproduced');
  assert.match(parseVerification('```json\n{"status":"skipped","evidence":"x"}\n```').error, /status must be/);
  assert.match(parseVerification('```json\n{"status":"reproduced"}\n```').error, /evidence/);
  assert.match(parseVerification('nothing').error, /no JSON/);
});

test('the copy a runner mounts has no .git, no .claude, no secret env file and no symlink', async () => {
  const src = await mkdtemp(join(tmpdir(), 'copy-src-'));
  await mkdir(join(src, '.git')); await writeFile(join(src, '.git/config'), 'url = https://oauth2:TOKEN@host');
  await mkdir(join(src, 'src')); await writeFile(join(src, 'src/a.ts'), 'a');
  await writeFile(join(src, '.env'), 'SECRET=1'); await writeFile(join(src, '.env.local'), 'SECRET=2'); await writeFile(join(src, '.env.example'), 'SECRET=');
  await symlink('/etc', join(src, 'etc-link'));
  const copy = await copyWorktree(src);
  assert.ok(existsSync(join(copy.dir, 'src/a.ts')) && existsSync(join(copy.dir, '.env.example')));
  for (const gone of ['.git', '.env', '.env.local', 'etc-link']) assert.equal(existsSync(join(copy.dir, gone)), false, gone);
  await copy.remove();
  assert.equal(existsSync(copy.dir), false);
});
