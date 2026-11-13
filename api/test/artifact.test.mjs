import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artifactAt, artifactOf, writtenAtOf } from '../dist/src/artifact.js';
import { buildShape } from '../dist/src/findings.js';
import { versionTime } from '../dist/src/history.js';

// The review artifact across its interface only, on a real temp dir.
const reviews = () => mkdtemp(join(tmpdir(), 'marginalia-artifact-'));
const report = (content) => ({ content, shape: buildShape({ markdown: content }) });

test('a first review is written without anything to keep', async () => {
  const dir = await reviews();
  const art = artifactAt(dir, 'feat-x');
  assert.equal(await art.write(report('first review')), null);
  assert.equal(await readFile(art.markdownPath, 'utf8'), 'first review');
  assert.deepEqual(await art.listHistory(), []);
});

test('a re-run keeps the review it replaces, only when the content changed', async () => {
  const dir = await reviews();
  const art = artifactAt(dir, 'feat-x');
  await art.write(report('first review'));
  assert.equal(await art.write(report('first review')), null, 'identical content is not a new version');
  const id = await art.write(report('second review'));
  assert.ok(id);
  const versions = await art.listHistory();
  assert.equal(versions.length, 1);
  assert.equal(versions[0].id, id);
  assert.ok(!Number.isNaN(Date.parse(versions[0].at)));
  const old = await art.readHistory(id);
  assert.equal(old.markdown, 'first review');
  assert.equal(old.shape.version, 1, 'the shape that went with it is kept too');
  assert.equal(await readFile(art.markdownPath, 'utf8'), 'second review');
  assert.deepEqual((await readdir(dir)).filter((n) => n.endsWith('.md')), ['feat-x.md'], 'versions stay out of the review list');
});

test('a version kept before shapes were stored reads with a null shape', async () => {
  const dir = await reviews();
  const art = artifactAt(dir, 'old');
  await writeFile(art.markdownPath, 'legacy');
  const id = await art.write(report('next'));
  assert.deepEqual(await art.readHistory(id), { markdown: 'legacy', shape: null });
});

test('history ids cannot escape the history directory', async () => {
  const art = artifactAt(await reviews(), 'feat-x');
  assert.equal(await art.readHistory('../feat-x'), null);
});

test('the commit a review was run on is stored with it and kept when the review is replaced', async () => {
  const art = artifactAt(await reviews(), 'feat-sha');
  await art.write(report('a review'), 'abc123');
  assert.equal((await art.readShape()).reviewedSha, 'abc123');
  const id = await art.write(report('the next review'));
  assert.equal((await art.readHistory(id)).shape.reviewedSha, 'abc123');
  assert.equal((await art.readShape()).reviewedSha, undefined, 'no sha, no field');
});

test('a review without a stored shape is read from its markdown', async () => {
  const art = artifactAt(await reviews(), 'old');
  const shape = await art.readShape('**Verdict:** APPROVE\n\n## Suggestions\n\n- Tidy `src/a.ts:1`.\n');
  assert.equal(shape.source, 'markdown');
  assert.equal(shape.verdict, 'APPROVE');
});

test('the previous findings are those of the stored shape, none before a first review', async () => {
  const art = artifactAt(await reviews(), 'feat-x');
  assert.deepEqual(await art.previousFindings(), []);
  await art.write(report('**Verdict:** REQUEST_CHANGES\n\n## Critical\n\n- Null deref in `src/a.ts:3`.\n'));
  assert.ok((await art.previousFindings()).length >= 1);
});

test('the runner and the studio reach the same files', async () => {
  const dir = await reviews();
  await artifactOf(join(dir, 'feat-x.md')).write(report('hello'), 'sha1');
  assert.equal((await artifactAt(dir, 'feat-x').readShape()).reviewedSha, 'sha1');
});

test('a version id says when it was written', () => {
  assert.equal(versionTime('2026-03-01T10-20-30-456Z'), '2026-03-01T10:20:30.456Z');
});

// Copying the reviews dir (a backup, a move into a volume) resets file times: the date the review
// stores is when it was written, the file's time only when it stores none.
test('a review is dated by the time it stores, not by its file time', async () => {
  const art = artifactAt(await reviews(), 'feat-copied');
  await art.write(report('a review'));
  const stored = Date.parse((await art.readShape()).generatedAt);
  const copiedAt = new Date(stored + 86_400_000);
  await utimes(art.markdownPath, copiedAt, copiedAt);
  assert.equal(await art.writtenAt(), stored);
  assert.equal(await writtenAtOf(art.markdownPath), stored);
  const id = await art.write(report('the next review'));
  assert.equal(versionTime(id), new Date(stored).toISOString(), 'the kept version is named by when it was written');
});

test('a review without a stored time is dated by its file, and a missing one by nothing', async () => {
  const art = artifactAt(await reviews(), 'legacy');
  await writeFile(art.markdownPath, 'legacy');
  const at = new Date('2026-10-01T10:00:00Z');
  await utimes(art.markdownPath, at, at);
  assert.equal(await art.writtenAt(), at.getTime());
  assert.equal(await artifactAt(await reviews(), 'none').writtenAt(), null);
});
