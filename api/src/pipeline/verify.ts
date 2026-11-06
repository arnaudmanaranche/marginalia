// The verify stage of a review (ADR 0009): the blocking findings about behaviour are tried against the
// project in a disposable runner, a few at most, and each carries what was found. Never fails the
// review: a verification that cannot run is `inconclusive` or `skipped`, and says why.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { STAGE_VERIFY_TOOLS } from '../allowed-tools.ts';
import { DATA_DIR, DOCKER_BIN, VERIFY_EGRESS_NETWORK, VERIFY_EGRESS_PROXY, VERIFY_MAX_PER_REVIEW, VERIFY_RUNNER_IMAGE } from '../config.ts';
import { todayBudget } from '../budget-today.ts';
import { verifyLimits } from '../verify-limits.ts';
import { agentStage, mapLimit } from './agent-stage.ts';
import { copyWorktree } from './verify-copy.ts';
import { VERIFY_SYSTEM, parseVerification, verifyPrompt } from './verify-prompts.ts';
import { selectForVerify, skipReason } from './verify-select.ts';

const CONCURRENCY = 2;
const SERVER = fileURLToPath(new URL('../../bin/verify-mcp.js', import.meta.url));

// Why nothing can run for this review, or null: the project did not opt in (silent), no runner image,
// no approved recipe, or the day's budget is spent.
function gate(mr: any, recipe: any) {
  if (!mr.project.verify) return { silent: true as const };
  if (!VERIFY_RUNNER_IMAGE) return { reason: 'no runner image is configured (VERIFY_RUNNER_IMAGE)' };
  if (!recipe) return { reason: 'the approved project context has no recipe for running the project' };
  if (todayBudget().over) return { reason: 'the daily budget is reached' };
  return null;
}

const sentence = (reason: string) => `${reason[0].toUpperCase()}${reason.slice(1)}.`;
const mark = (findings: any[], ids: string[], verification: any) => findings.map((f) => (ids.includes(f.id) ? { ...f, verification } : f));

/** @param {{ run: any, mr: any, findings: any[], tour: any[], recipe: any, context: string, after: string, settings: object | null }} input */
export async function verifyFindings({ run, mr, findings, tour, recipe, context, after, settings }: { run: any; mr: any; findings: any[]; tour: any[]; recipe: any; context: string; after: string; settings: object | null }) {
  const wanted = findings.filter((f) => f.proof === 'runtime' && ['critical', 'important'].includes(f.severity));
  const blocked = wanted.length ? gate(mr, recipe) : { silent: true as const };
  if (blocked && 'silent' in blocked) return { findings, warnings: [] as string[] };
  if (blocked) return { findings: mark(findings, wanted.map((f) => f.id), { status: 'skipped', evidence: sentence(blocked.reason) }), warnings: [`verification did not run: ${blocked.reason}`] };

  const picked = selectForVerify(findings, Number(VERIFY_MAX_PER_REVIEW) || 4);
  let out = findings;
  for (const f of wanted.filter((w) => !picked.includes(w.id))) out = mark(out, [f.id], { status: 'skipped', evidence: sentence(skipReason(f, picked) ?? 'it was not selected') });
  const todo = picked.map((id, i) => ({ id, stage: `verify-${i + 1}`, finding: findings.find((f) => f.id === id) }));
  await run.plan(after, todo.map((t) => [t.stage, `Reproduce: ${t.finding.title}`]));
  const limits = verifyLimits(mr.project);
  const results = await mapLimit(todo, CONCURRENCY, async ({ stage, finding }) => {
    await run.begin(stage);
    const copy = await copyWorktree(mr.project.worktreeDir).catch(() => null);
    try {
      if (!copy) throw new Error('the project could not be copied for the runner');
      const config = join(copy.dir, '..', 'runner.json');
      const egress = VERIFY_EGRESS_NETWORK && VERIFY_EGRESS_PROXY ? { network: VERIFY_EGRESS_NETWORK, proxy: VERIFY_EGRESS_PROXY } : null;
      await writeFile(config, JSON.stringify({ image: VERIFY_RUNNER_IMAGE, workdir: copy.dir, limits, steps: recipe.steps, hosts: recipe.hosts ?? [], forbidden: [DATA_DIR, join(homedir(), '.claude'), mr.project.repoPath, mr.project.worktreeDir], docker: DOCKER_BIN, egress }));
      const mcp = JSON.stringify({ mcpServers: { verify: { command: process.execPath, args: [SERVER, config] } } });
      const chapter = tour.find((c: any) => (c.findings ?? []).includes(finding.id));
      const value = await agentStage({ run, stage, prompt: verifyPrompt({ context, finding, chapter, recipe }), system: VERIFY_SYSTEM, tools: STAGE_VERIFY_TOOLS, cwd: mr.project.worktreeDir, settings, extraArgs: ['--mcp-config', mcp, '--strict-mcp-config'], parse: parseVerification });
      await run.end(stage);
      return value;
    } catch (err) {
      await run.end(stage, 'failed');
      run.step(`This verification could not run: ${String(err.message).slice(0, 200)}`, { stage });
      return { status: 'inconclusive', evidence: `Could not run: ${String(err.message).slice(0, 200)}`, command: null };
    } finally {
      await copy?.remove();
    }
  });
  todo.forEach((t, i) => { out = mark(out, [t.id], results[i]); });
  return { findings: out, warnings: results.some((r) => r.status === 'inconclusive') ? ['some findings could not be reproduced here (inconclusive)'] : [] };
}
