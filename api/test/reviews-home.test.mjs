import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
const { moveReviewsHome } = await import('../dist/src/reviews-home.js');

test('reviews left in the repository are copied once, without overwriting or deleting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'home-'));
  const project = { key: 'p', reviewsDir: join(root, 'data'), legacyReviewsDir: join(root, 'repo') };
  assert.equal(await moveReviewsHome(project), false, 'nothing to copy when the repository has none');
  await mkdir(join(project.legacyReviewsDir, '.history'), { recursive: true });
  await mkdir(project.reviewsDir, { recursive: true });
  await writeFile(join(project.legacyReviewsDir, 'a.md'), 'old a');
  await writeFile(join(project.legacyReviewsDir, 'b.md'), 'old b');
  await writeFile(join(project.legacyReviewsDir, '.history', 'h.md'), 'hist');
  await writeFile(join(project.reviewsDir, 'a.md'), 'new a');
  assert.equal(await moveReviewsHome(project), true);
  assert.equal(await readFile(join(project.reviewsDir, 'a.md'), 'utf8'), 'new a');
  assert.equal(await readFile(join(project.reviewsDir, 'b.md'), 'utf8'), 'old b');
  assert.equal(await readFile(join(project.reviewsDir, '.history', 'h.md'), 'utf8'), 'hist');
  assert.equal(await readFile(join(project.legacyReviewsDir, 'a.md'), 'utf8'), 'old a');
});
