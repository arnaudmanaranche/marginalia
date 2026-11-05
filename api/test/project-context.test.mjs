import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enforceContract } from '../dist/src/guardrail.js';
import { approveDraft, contextPath, readContext, saveDraft } from '../dist/src/context-store.js';
import { CONTEXT_FILE, understandPrompt } from '../dist/src/understand-prompt.js';
import { UNDERSTAND_TOOLS } from '../dist/src/allowed-tools.js';
import { isConnectorWrite } from '../dist/src/connector-tools.js';

const src = (ref) => [{ kind: 'file', ref }];
const context = (patch = {}) => ({
  summary: 'An API that books rooms.',
  glossary: [{ name: 'Booking', summary: 'A held room for dates.', codeNames: ['Reservation'], sources: src('docs/domain.md') }],
  stack: [{ name: 'Data layer', summary: 'Postgres through an ORM.', where: ['src/db'], sources: src('package.json') }],
  features: [{ name: 'Search', summary: 'Free rooms for dates.', where: ['src/search'], sources: src('src/routes.ts') }],
  criticalPaths: [
    { name: 'Payment', summary: 'Card capture then booking.', rank: 1, tests: ['test/pay.test.ts'], sources: [{ kind: 'ticket', ref: 'BK-12' }] },
    { name: 'Search', summary: 'Rooms for dates.', rank: 2, sources: src('src/search/index.ts') },
  ],
  ...patch,
});

test('a sourced project context passes, for any kind of repo', () => {
  assert.equal(enforceContract('context', JSON.stringify(context())).summary, 'An API that books rooms.');
});

test('an empty section, an uncited item or two paths on one rank are rejected', () => {
  assert.throws(() => enforceContract('context', JSON.stringify(context({ features: [] }))), /features/);
  const uncited = context();
  uncited.glossary[0].sources = [];
  assert.throws(() => enforceContract('context', JSON.stringify(uncited)), /glossary\.0\.sources/);
  const tied = context();
  tied.criticalPaths[1].rank = 1;
  assert.throws(() => enforceContract('context', JSON.stringify(tied)), /share a rank/);
  assert.throws(() => enforceContract('context', null), /broke the contract/);
});

test('a new draft never replaces the approved context until a person approves it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ctx-'));
  await saveDraft(dir, { key: 'api', commit: 'aaa111', context: context() });
  assert.equal(await readContext(dir, 'api', 'approved'), null);
  const approved = await approveDraft(dir, 'api', 'alex');
  assert.equal(approved.state, 'approved');
  assert.equal(approved.approvedBy, 'alex');
  assert.ok(!existsSync(contextPath(dir, 'api', 'draft')));
  await saveDraft(dir, { key: 'api', commit: 'bbb222', context: context({ summary: 'Changed.' }) });
  assert.equal((await readContext(dir, 'api', 'approved')).commit, 'aaa111');
  assert.equal((await readContext(dir, 'api', 'draft')).context.summary, 'Changed.');
  assert.equal(await approveDraft(dir, 'other', 'alex'), null);
  assert.match(await readFile(contextPath(dir, 'api', 'approved'), 'utf8'), /"approvedBy": "alex"/);
});

test('the Understand job is told where to write, and gets no write tool on a connector', () => {
  const prompt = understandPrompt({ methodPath: '/pkg/jobs/understand.md', worktreeDir: '/data/wt', project: { key: 'api', gitlabProjectId: 'g/api', kind: 'back' }, branch: 'main' });
  assert.ok(prompt.includes(`/data/wt/${CONTEXT_FILE}`));
  assert.ok(prompt.includes('/pkg/jobs/understand.md'));
  assert.match(prompt, /back-end/);
  assert.deepEqual(UNDERSTAND_TOOLS.filter(isConnectorWrite), []);
  assert.ok(!UNDERSTAND_TOOLS.some((t) => /git (fetch|worktree)/.test(t)));
});
