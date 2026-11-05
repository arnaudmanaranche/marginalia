import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { CLAUDE_BIN, DATA_DIR } from './config.ts';
import { PACKAGE_ROOT } from './package-root.ts';
import { gitlab } from './gitlab-api.ts';
import { gitIn } from './git.ts';
import { fetchBranch } from './git-refs.ts';
import { addWorktree } from './git-worktree.ts';
import { UNDERSTAND_TOOLS } from './allowed-tools.ts';
import { claudeArgs, parseRunOutput } from './claude-cli.ts';
import { runEnv, runSettings } from './run-settings.ts';
import { runStreaming } from './progress.ts';
import { enforceContract } from './guardrail.ts';
import { saveDraft } from './context-store.ts';
import { CONTEXT_FILE, UNDERSTAND_SYSTEM, understandPrompt } from './understand-prompt.ts';
import { serial } from './serial.ts';
import { followRun } from './run-tracker.ts';

// The run journal's name for this job's runs, beside the reviews of the project.
export const CONTEXT_JOB = '_context';

const METHOD = join(PACKAGE_ROOT, 'jobs', 'understand.md');
const TIMEOUT_MS = 45 * 60_000;

// A worktree of its own, detached at the default branch as origin has it: an Understand job never
// shares the review worktree, and starts from a clean tree each time.
async function checkoutDefault(project: any) {
  const branch = (await gitlab.getProject(project)).default_branch;
  const ref = `refs/marginalia/understand/${project.key}`;
  await fetchBranch(project.repoPath, branch, ref);
  const dir = join(DATA_DIR, 'worktrees', `${project.key}-understand`);
  if (existsSync(dir)) {
    await gitIn(dir).run('checkout', '--quiet', '--detach', '--force', ref);
    await gitIn(dir).run('clean', '-fdxq');
  } else {
    await addWorktree(project.repoPath, dir, ref);
  }
  const commit = (await gitIn(dir).run('rev-parse', 'HEAD')).trim();
  return { branch, dir, commit };
}

// Learns a project into a draft context (context-store.ts), for a person to approve. `onStep` gets
// what the agent is doing, as a review run's live panel does. Throws on a broken contract: nothing
// is stored then.
/** @param {any} project @param {{ onStep?: (step: string) => void }} [opts] */
export function understandProject(project: any, { onStep = (_step: string) => {} } = {}) {
  return serial.run(async () => {
    // Followed like any run (run-tracker.ts): it shows in the studio's jobs, live and afterwards.
    const target = { project, iid: null, title: 'Learn the project', source_branch: null };
    const run = await followRun(target, { kind: 'understand', command: 'understand', outputPath: join(project.reviewsDir, `${CONTEXT_JOB}.md`), plan: 'understand' });
    const say = (step: string, stage: string, tool: string | null = null) => {
      onStep(step);
      run.step(step, { stage, tool });
    };
    try {
      await run.stage('checkout');
      say(`Checking out the default branch of ${project.gitlabProjectId}`, 'checkout');
      const { branch, dir, commit } = await checkoutDefault(project);
      const output = join(dir, CONTEXT_FILE);
      await rm(output, { force: true });
      const prompt = understandPrompt({ methodPath: METHOD, worktreeDir: dir, project, branch });
      const settings = runSettings({ ...project, worktreeDir: dir });
      const call = async (text: string, resume: string | null) => {
        const args = [...claudeArgs({ prompt: text, tools: UNDERSTAND_TOOLS, systemPrompt: UNDERSTAND_SYSTEM, settings, resume }), '--add-dir', join(PACKAGE_ROOT, 'jobs')];
        const { stdout } = await runStreaming(CLAUDE_BIN, args, { cwd: dir, env: runEnv(), timeout: TIMEOUT_MS }, (step, info) => say(step, 'agent', info.tool), (line) => run.event(line), { name: 'understand', traceId: run.id, kind: 'understand', project: project.key });
        const out = parseRunOutput(stdout);
        if (out.stats) run.addCost(out.stats);
        return out;
      };
      const check = async () => enforceContract('context', await readFile(output, 'utf8').catch(() => null));
      await run.stage('agent');
      const first = await call(prompt, null);
      await run.stage('report');
      // A context that does not fit the contract is sent back once, in the same session, with what was wrong.
      const context = await check().catch(async (err) => {
        if (!first.sessionId) throw err;
        say(`${err.message}: asking again`, 'report');
        await call(`${err.message} Fix the file at ${output} so it fits the shape asked, then stop.`, first.sessionId);
        return check();
      });
      const path = await saveDraft(DATA_DIR, { key: project.key, commit, context });
      await run.finish('reviewed');
      return { path, commit, branch, costUsd: run.cost?.usd ?? 0 };
    } catch (err) {
      await run.finish('failed', err.message);
      throw err;
    }
  });
}
