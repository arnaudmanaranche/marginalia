// Manual, before a release: `npm run eval [-- <case>]`. Each case in evals/cases is a base and a head
// (a branch with one planted problem, or a clean change). The real `claude` reviews it with the
// contract prompt and the catalog, and the result is checked: it passes the contract, the planted
// problem is found at its file and line, a clean change has no critical finding. It costs a run each.
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PACKAGE_ROOT } from '../src/package-root.ts';
import { assembleCatalog } from '../src/catalog-assemble.ts';
import { catalogPrompt } from '../src/catalog.ts';
import { claudeArgs, claudeEnv, parseRunOutput } from '../src/claude-cli.ts';
import { contractPrompt } from '../src/run-contract.ts';
import { enforceContract } from '../src/guardrail.ts';
import { buildReport, clearStaleReport } from '../src/report.ts';

const run = promisify(execFile);
const CASES = join(PACKAGE_ROOT, 'evals', 'cases');
const TOOLS = ['Read', 'Grep', 'Glob', 'Skill', 'Write', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)', 'Bash(git status:*)'];

async function seed(name: string) {
  const dir = await mkdtemp(join(tmpdir(), `marginalia-eval-${name}-`));
  const git = (...args: string[]) => run('git', ['-c', 'user.name=eval', '-c', 'user.email=eval@example.com', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: dir });
  await git('init', '-q', '-b', 'main');
  await cp(join(CASES, name, 'base'), dir, { recursive: true });
  await git('add', '-A');
  await git('commit', '-qm', 'base');
  await git('checkout', '-qb', 'feature');
  await cp(join(CASES, name, 'head'), dir, { recursive: true });
  await git('add', '-A');
  await git('commit', '-qm', 'the change');
  return dir;
}

async function evaluate(name: string, catalog: Awaited<ReturnType<typeof assembleCatalog>>) {
  const expect = JSON.parse(await readFile(join(CASES, name, 'expect.json'), 'utf8'));
  const dir = await seed(name);
  await clearStaleReport(dir);
  const systemPrompt = contractPrompt('review', catalogPrompt(catalog.skills), dir);
  const prompt = 'Review the change on this branch against main (git diff main...HEAD), following the skills you were told about.';
  const { stdout } = await run(process.env.CLAUDE_BIN || 'claude', [...claudeArgs({ prompt, tools: TOOLS, systemPrompt }), ...catalog.args], { cwd: dir, env: claudeEnv(process.env), maxBuffer: 64 << 20 });
  const report = await buildReport({ worktreeDir: dir, stdout: parseRunOutput(stdout).text });
  const problems: string[] = [];
  try { enforceContract('review', report.findingsRaw); } catch (err) { problems.push((err as Error).message); }
  const serious = (report.shape.findings ?? []).filter((f: any) => f.severity === 'critical' || f.severity === 'important');
  if (expect.planted) {
    const [from, to] = expect.planted.lines;
    if (!serious.some((f: any) => f.path === expect.planted.path && f.line >= from - 2 && f.line <= to + 2)) problems.push(`the planted problem was not found at ${expect.planted.path}:${from}-${to}`);
  } else if (serious.some((f: any) => f.severity === 'critical')) problems.push('a clean change got a critical finding');
  return problems;
}

const only = process.argv[2];
const names = (await readdir(CASES)).filter((n) => !only || n === only);
const catalog = await assembleCatalog(await mkdtemp(join(tmpdir(), 'marginalia-eval-data-')));
let failed = 0;
for (const name of names) {
  const problems = await evaluate(name, catalog).catch((err) => [`the run failed: ${String(err.message).slice(0, 200)}`]);
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name}${problems.map((p) => `\n       ${p}`).join('')}`);
  failed += problems.length ? 1 : 0;
}
console.log(`\n${names.length - failed} of ${names.length} cases passed`);
process.exit(failed ? 1 : 0);
