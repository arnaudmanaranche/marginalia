// Manual, before a release or a stage method release: `npm run eval [-- <case>] [--upload]`. Each case in
// evals/cases is a base and a head (a branch with one planted problem, or a clean change). The real
// `claude` reviews it through the staged pipeline, as the bot does, and eval-score.ts scores the result:
// it passes the contract, the planted problem is found at its file and line and names the repo rule it
// breaks, a clean change has no critical finding, nothing is louder than the change deserves. It costs a
// run each. `--upload` sends the scores to PostHog Offline Evaluations (eval-upload.ts); pin the methods
// to try with MARGINALIA_PROMPT_VERSIONS.
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
const { scoreCase } = await import('./eval-score.ts');
const { RUNNING_VERSION } = await import('../src/config-team.ts');

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
  const skip = (why: string) => ({ name, about: expect.about ?? '', findings: [], methods: null, scores: [{ scorer: 'contract_valid', pass: false, why }] });
  if (verifies && !VERIFY_RUNNER_IMAGE) return skip('set VERIFY_RUNNER_IMAGE (an image with the toolchain of the case) to run this case');
  const project = { key: `eval-${name}`, worktreeDir: dir, repoPath: dir, reviewsDir: join(dir, '.reviews'), verify: verifies, verifyLimits: null };
  if (verifies) {
    await saveDraft(DATA_DIR, { key: project.key, commit: 'eval', context: JSON.parse(await readFile(join(CASES, name, 'context.json'), 'utf8')) });
    await approveDraft(DATA_DIR, project.key, 'eval');
  }
  const mr = { iid: null, title: `Eval: ${name}`, description: null, source_branch: 'feature', target_branch: 'main', project, author: null, web_url: null };
  const outputPath = join(project.reviewsDir, `${name}.md`);
  const tracked = await followRun(mr, { kind: 'review', command: 'marginalia', outputPath });
  let error: string | null = null;
  const report = await stagedRun({ mr, run: tracked, kind: 'review', outputPath }).catch((err: Error) => {
    error = err.message;
    return null;
  });
  await tracked.finish(report ? 'reviewed' : 'failed');
  const shape = report?.shape ?? null;
  return { name, about: expect.about ?? '', findings: shape?.findings ?? [], methods: shape?.methods ?? null, scores: scoreCase(expect, shape, error) };
}

const args = process.argv.slice(2);
const upload = args.includes('--upload');
const only = args.find((a) => !a.startsWith('--'));
const names = (await readdir(CASES)).filter((n) => !only || n === only);
const results = [];
let failed = 0;
for (const name of names) {
  const result = await evaluate(name).catch((err) => ({ name, about: '', findings: [], methods: null, scores: [{ scorer: 'contract_valid', pass: false, why: `the run failed: ${String(err.message).slice(0, 200)}` }] }));
  results.push(result);
  const failing = result.scores.filter((s: any) => s.pass === false);
  console.log(`${failing.length ? 'FAIL' : 'ok  '} ${name}${failing.map((s: any) => `\n       ${s.scorer}: ${s.why}`).join('')}`);
  failed += failing.length ? 1 : 0;
}
console.log(`\n${names.length - failed} of ${names.length} cases passed`);
if (upload) {
  const { uploadEval } = await import('./eval-upload.ts');
  await uploadEval(results, { version: RUNNING_VERSION })
    .then(({ experimentId, promptVersion }) => console.log(`Uploaded to PostHog Offline Evaluations: experiment ${experimentId} (${promptVersion})`))
    .catch((err: Error) => { console.error(`The upload failed: ${err.message}`); failed += 1; });
}
process.exit(failed ? 1 : 0);
