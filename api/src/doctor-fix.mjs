// @ts-check
import { existsSync } from 'node:fs';
import { rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { CLAUDE_BIN, DATA_DIR, ROOT } from './config.mjs';
import { claudeArgs, parseRunOutput } from './claude-cli.mjs';
import { FIX_TOOLS, fixPrompt } from './doctor-prompt.mjs';
import { execFileAsync } from './exec.mjs';
import { gitIn } from './git.mjs';
import { head, originUrl } from './git-refs.mjs';
import { removeWorktree } from './git-worktree.mjs';
import { logger } from './logger.mjs';
import { runStreaming } from './progress.mjs';
import { readRunPart, readTrace, saveRunPart } from './run-journal.mjs';
import { runEnv } from './run-settings.mjs';
import { appendRun } from './runlog.mjs';

// The doctor's fix for a failure that belongs in Marginalia: made by Claude in a worktree of a git
// clone of Marginalia (MARGINALIA_SOURCE_DIR, else the install itself when it is one), on a branch
// doctor/<run>, committed and tested there. It is pushed only when the person asks, from the studio.
const SOURCE_DIR = process.env.MARGINALIA_SOURCE_DIR || ROOT;
const FIXES_DIR = join(DATA_DIR, 'doctor-fixes');
const TIMEOUT_MS = 20 * 60_000;
const SYSTEM = "You are Marginalia's doctor, fixing a failure you diagnosed, in Marginalia's own code. Only the worktree you are in may change.";

// Whether fixes can be prepared here, and if not, why (shown in the studio).
export async function fixSource() {
  try {
    await gitIn(SOURCE_DIR).run('rev-parse', '--is-inside-work-tree');
    await originUrl(SOURCE_DIR);
    return { available: true, dir: SOURCE_DIR };
  } catch {
    return { available: false, dir: SOURCE_DIR, why: `${SOURCE_DIR} is not a git clone of Marginalia with an origin. Set MARGINALIA_SOURCE_DIR to one to let the doctor prepare fixes.` };
  }
}

const running = new Set();

/** @param {{ project: any, fileSlug: string, runId: string }} input */
export async function startFix({ project, fileSlug, runId }) {
  const key = `${project.key}/${fileSlug}/${runId}`;
  if (running.has(key)) return { ok: false, status: 409, error: 'the fix is already being prepared' };
  const [trace, doctor, source] = await Promise.all([readTrace(project.key, fileSlug, runId), readRunPart(project.key, fileSlug, runId, 'doctor'), fixSource()]);
  if (!trace || doctor?.state !== 'done') return { ok: false, status: 404, error: 'no diagnosis for this run' };
  if (!doctor.fix?.inBot) return { ok: false, status: 409, error: 'the doctor did not place the fix in Marginalia' };
  if (!source.available) return { ok: false, status: 409, error: source.why };
  running.add(key);
  const startedAt = new Date().toISOString();
  const save = (data) => saveRunPart(project.key, fileSlug, runId, 'fix', { startedAt, ...data });
  await save({ state: 'running' });
  void prepare({ trace, doctor, save }).finally(() => running.delete(key));
  return { ok: true };
}

async function prepare({ trace, doctor, save }) {
  const branch = `doctor/${trace.id.toLowerCase()}`;
  const dir = join(FIXES_DIR, trace.id);
  try {
    await rm(dir, { recursive: true, force: true });
    const source = gitIn(SOURCE_DIR);
    await source.run('worktree', 'prune');
    const base = await head(SOURCE_DIR);
    await source.run('worktree', 'add', '-B', branch, dir, base);
    // The tests need the dependencies; the worktree borrows the clone's.
    for (const sub of ['node_modules', 'ui/node_modules']) {
      if (existsSync(join(SOURCE_DIR, sub))) await symlink(join(SOURCE_DIR, sub), join(dir, sub)).catch(() => {});
    }
    const args = claudeArgs({ prompt: fixPrompt({ trace, doctor }), tools: FIX_TOOLS, systemPrompt: SYSTEM });
    const { stdout } = await runStreaming(CLAUDE_BIN, args, { cwd: dir, timeout: TIMEOUT_MS, env: runEnv() });
    const { text, stats } = parseRunOutput(stdout);
    if (stats) await appendRun({ project: trace.project, iid: trace.iid, kind: 'doctor-fix', command: 'doctor fix', ...stats });
    const fixed = await head(dir);
    if (fixed === base) {
      await save({ state: 'nothing', branch, note: text.trim().slice(0, 2000) });
      await removeWorktree(SOURCE_DIR, dir).catch(() => {});
      return;
    }
    const diffStat = await gitIn(dir).run('diff', '--stat', `${base}..${fixed}`);
    // The bot checks the tests itself rather than taking the agent's word for it.
    const testsPassed = await execFileAsync('npm', ['test', '--silent'], { cwd: dir, maxBuffer: 20 * 1024 * 1024 }).then(() => true, () => false);
    await save({ state: 'ready', branch, base, commit: fixed, dir, diffStat, testsPassed, note: text.trim().slice(0, 2000), cost: stats?.costUsd ?? null });
  } catch (err) {
    logger.warn({ err }, 'The doctor could not prepare the fix');
    await save({ state: 'failed', branch, error: String(err.message ?? err).slice(0, 1000) });
  }
}

// Pushes the doctor's branch, on the person's word. The remote's answer (with its "create a merge
// request" link) is kept to show; the worktree goes, the branch stays.
/** @param {{ project: any, fileSlug: string, runId: string }} input */
export async function pushFix({ project, fileSlug, runId }) {
  const fix = await readRunPart(project.key, fileSlug, runId, 'fix');
  if (fix?.state !== 'ready') return { ok: false, status: 409, error: 'no fix ready to push' };
  try {
    const out = await gitIn(fix.dir).raw('push', '-u', 'origin', fix.branch);
    const said = `${out.stdout}\n${out.stderr}`;
    const url = said.match(/https?:\/\/\S+(merge_requests\/new|\/pull\/new\/)\S*/)?.[0] ?? null;
    await saveRunPart(project.key, fileSlug, runId, 'fix', { ...fix, state: 'pushed', pushedAt: new Date().toISOString(), url });
    await removeWorktree(SOURCE_DIR, fix.dir).catch(() => {});
    return { ok: true, url };
  } catch (err) {
    return { ok: false, status: 502, error: String(err.message ?? err).slice(0, 500) };
  }
}
