// Manual, before a release: `npm run eval [-- <case>]`. Each case in evals/cases is a base and a head
// (a branch with one planted problem, or a clean change). The real `claude` reviews it through the
// staged pipeline, as the bot does, and the result is checked: it passes the contract, the planted
// problem is found at its file and line, a clean change has no critical finding. It costs a run each.
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
// The runs, the catalog and the journal go to a throwaway data dir, never the bot's own.
process.env.MARGINALIA_HOME = await mkdtemp(join(tmpdir(), 'marginalia-eval-home-'));
process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
process.env.MARGINALIA_DB = ':memory:';
const { PACKAGE_ROOT } = await import('../src/package-root.ts');
const { stagedRun } = await import('../src/pipeline/staged.ts');
const { followRun } = await import('../src/run-tracker.ts');
const { saveDraft, approveDraft } = await import('../src/context-store.ts');
const { DATA_DIR, VERIFY_RUNNER_IMAGE } = await import('../src/config.ts');
const CASES = join(PACKAGE_ROOT, 'evals', 'cases');

async function seed(name: string) {
  const dir = await mkdtemp(join(tmpdir(), `marginalia-eval-${name}-`));
  const git = (...args: string[]) => run('git', ['-c', 'user.name=eval', '-c', 'user.email=eval@example.com', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: dir });
  await git('init', '-q', '-b', 'main');
  await cp(join(CASES, name, 'base'), dir, { recursive: true });
  await git('add', '-A');
  await git('commit', '-qm', 'base');
  await git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  await git('checkout', '-qb', 'feature');
  await cp(join(CASES, name, 'head'), dir, { recursive: true });
  await git('add', '-A');
  await git('commit', '-qm', 'the change');
  return dir;
}

async function evaluate(name: string) {
  const expect = JSON.parse(await readFile(join(CASES, name, 'expect.json'), 'utf8'));
  const dir = await seed(name);
  // A branch without an MR: nothing is read from GitLab.
  // A case with `verification` in its expect.json opts the project in and approves its context.json
  // (the recipe), so the verify stage may run: it needs Docker and VERIFY_RUNNER_IMAGE (an image with node).
  const verifies = Boolean(expect.verification);
  if (verifies && !VERIFY_RUNNER_IMAGE) return ['set VERIFY_RUNNER_IMAGE (an image with the toolchain of the case) to run this case'];
  const project = { key: `eval-${name}`, worktreeDir: dir, repoPath: dir, reviewsDir: join(dir, '.reviews'), verify: verifies, verifyLimits: null };
  if (verifies) {
    await saveDraft(DATA_DIR, { key: project.key, commit: 'eval', context: JSON.parse(await readFile(join(CASES, name, 'context.json'), 'utf8')) });
    await approveDraft(DATA_DIR, project.key, 'eval');
  }
  const mr = { iid: null, title: `Eval: ${name}`, description: null, source_branch: 'feature', target_branch: 'main', project, author: null, web_url: null };
  const outputPath = join(project.reviewsDir, `${name}.md`);
  const tracked = await followRun(mr, { kind: 'review', command: 'marginalia', outputPath });
  const problems: string[] = [];
  const report = await stagedRun({ mr, run: tracked, kind: 'review', outputPath }).catch((err: Error) => {
    problems.push(err.message);
    return null;
  });
  await tracked.finish(report ? 'reviewed' : 'failed');
  if (!report) return problems;
  const serious = (report.shape.findings ?? []).filter((f: any) => f.severity === 'critical' || f.severity === 'important');
  if (expect.planted) {
    const [from, to] = expect.planted.lines;
    if (!serious.some((f: any) => f.path === expect.planted.path && f.line >= from - 2 && f.line <= to + 2)) problems.push(`the planted problem was not found at ${expect.planted.path}:${from}-${to}`);
  } else if (serious.some((f: any) => f.severity === 'critical')) problems.push('a clean change got a critical finding');
  const tried = (report.shape.findings ?? []).filter((f: any) => ['reproduced', 'not_reproduced', 'inconclusive'].includes(f.verification?.status));
  if (expect.verification === 'reproduced' && !tried.some((f: any) => f.verification.status === 'reproduced')) problems.push(`no finding was reproduced (${(report.shape.findings ?? []).map((f: any) => `${f.id}: ${f.proof}/${f.verification?.status ?? 'no verification'}`).join(', ') || 'no finding'})`);
  // `evidence: screenshot` (ADR 0010): the reproduced finding must carry the screenshot the browser took.
  if (expect.evidence === 'screenshot' && !tried.some((f: any) => f.verification.status === 'reproduced' && f.verification.artifacts?.some((a: any) => a.kind === 'screenshot'))) problems.push('no reproduced finding carries a screenshot (is VERIFY_RUNNER_IMAGE the browser image?)');
  if (expect.verification === 'none' && tried.length) problems.push(`something was run for a pattern-only change: ${tried.map((f: any) => f.id).join(', ')}`);
  return problems;
}

const only = process.argv[2];
const names = (await readdir(CASES)).filter((n) => !only || n === only);
let failed = 0;
for (const name of names) {
  const problems = await evaluate(name).catch((err) => [`the run failed: ${String(err.message).slice(0, 200)}`]);
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name}${problems.map((p) => `\n       ${p}`).join('')}`);
  failed += problems.length ? 1 : 0;
}
console.log(`\n${names.length - failed} of ${names.length} cases passed`);
process.exit(failed ? 1 : 0);
