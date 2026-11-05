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
  const project = { key: `eval-${name}`, worktreeDir: dir, repoPath: dir, reviewsDir: join(dir, '.reviews') };
  const mr = { iid: null, title: `Eval: ${name}`, description: null, source_branch: 'feature', target_branch: 'main', project, author: null, web_url: null };
  const outputPath = join(project.reviewsDir, `${name}.md`);
  const tracked = await followRun(mr, { kind: 'review', command: 'marginalia', outputPath, plan: 'staged-review' });
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
