// The verification of a review (ADR 0009, 0010), done per chapter: when a chapter's reviewer has answered,
// its blocking findings about behaviour are tried against the project in a disposable runner, so the
// evidence arrives with the chapter. The chapters share one budget: a few verifications per review, two
// runners at a time, and a finding another chapter already took is not run twice. Never fails the review:
// a verification that cannot run is `inconclusive` or `skipped`, and says why.
import { writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { STAGE_VERIFY_BROWSER_TOOLS, STAGE_VERIFY_TOOLS } from '../allowed-tools.ts';
import { DATA_DIR, DOCKER_BIN, VERIFY_EGRESS_NETWORK, VERIFY_EGRESS_PROXY, VERIFY_MAX_PER_REVIEW, VERIFY_RUNNER_IMAGE, VERIFY_WORK_DIR, VERIFY_WORK_VOLUME } from '../config.ts';
import { todayBudget } from '../budget-today.ts';
import { verifyLimits } from '../verify-limits.ts';
import { evidenceFolder, evidenceId, readEvidence } from '../verify-evidence.ts';
import { agentStage } from './agent-stage.ts';
import { copyWorktree } from './verify-copy.ts';
import { VERIFY_SYSTEM, parseVerification, verifyPrompt } from './verify-prompts.ts';
import { findingKey } from './review-merge.ts';
import { OVER_LIMIT, selectForVerify } from './verify-select.ts';
import { createLimiter } from './limiter.ts';

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
const skipped = (reason: string) => ({ status: 'skipped', evidence: sentence(reason) });

/** The verifier of one review: `chapter()` is called once per chapter, as its reviewer answers. */
export function reviewVerifier({ run, mr, recipe, context, settings }: { run: any; mr: any; recipe: any; context: string; settings: object | null }) {
  const limits = verifyLimits(mr.project);
  const slot = createLimiter(CONCURRENCY);
  const taken = new Set<string>();
  let left = Number(VERIFY_MAX_PER_REVIEW) || 4;
  let count = 0;

  async function reproduce(stage: string, finding: any, chapter: any) {
    await run.begin(stage);
    const copy = await copyWorktree(mr.project.worktreeDir, VERIFY_WORK_VOLUME ? VERIFY_WORK_DIR : undefined).catch(() => null);
    try {
      if (!copy) throw new Error('the project could not be copied for the runner');
      const id = evidenceId(run.id, stage);
      const config = join(copy.dir, '..', 'runner.json');
      const egress = VERIFY_EGRESS_NETWORK && VERIFY_EGRESS_PROXY ? { network: VERIFY_EGRESS_NETWORK, proxy: VERIFY_EGRESS_PROXY } : null;
      await writeFile(config, JSON.stringify({ image: VERIFY_RUNNER_IMAGE, workdir: copy.dir, limits, steps: recipe.steps, hosts: recipe.hosts ?? [], browser: recipe.browser ?? null, evidenceDir: recipe.browser ? evidenceFolder(DATA_DIR, mr.project.key, id) : null, forbidden: [DATA_DIR, join(homedir(), '.claude'), mr.project.repoPath, mr.project.worktreeDir], docker: DOCKER_BIN, egress, work: VERIFY_WORK_VOLUME && VERIFY_WORK_DIR ? { volume: VERIFY_WORK_VOLUME, subpath: relative(VERIFY_WORK_DIR, copy.dir) } : null }));
      const mcp = JSON.stringify({ mcpServers: { verify: { command: process.execPath, args: [SERVER, config] } } });
      const value = await agentStage({ run, stage, prompt: verifyPrompt({ context, finding, chapter, recipe }), system: VERIFY_SYSTEM, tools: recipe.browser ? STAGE_VERIFY_BROWSER_TOOLS : STAGE_VERIFY_TOOLS, cwd: mr.project.worktreeDir, settings, extraArgs: ['--mcp-config', mcp, '--strict-mcp-config'], parse: parseVerification });
      await run.end(stage);
      // What the browser kept is attached to the finding whatever the agent answered.
      const artifacts = recipe.browser ? await readEvidence(evidenceFolder(DATA_DIR, mr.project.key, id), mr.project.key, id).catch((err) => { run.step(`The evidence could not be read: ${String(err.message).slice(0, 160)}`, { stage }); return []; }) : [];
      const { artifacts: _claimed, ...answer } = value as any;
      return artifacts.length ? { ...answer, artifacts } : answer;
    } catch (err) {
      await run.end(stage, 'failed');
      run.step(`This verification could not run: ${String(err.message).slice(0, 200)}`, { stage });
      return { status: 'inconclusive', evidence: `Could not run: ${String(err.message).slice(0, 200)}`, command: null };
    } finally {
      await copy?.remove();
    }
  }

  /** The chapter's findings with what reproducing them found, once it is done. `after`: the chapter's stage. */
  return async function chapter({ after, chapter, findings }: { after: string; chapter: any; findings: any[] }) {
    const out = findings.map((f) => ({ ...f }));
    // A finding another chapter already took is theirs: the merge keeps what they found.
    const wanted = out.filter((f) => f.proof === 'runtime' && ['critical', 'important'].includes(f.severity) && !taken.has(findingKey(f)));
    const blocked = wanted.length ? gate(mr, recipe) : { silent: true as const };
    if (blocked && 'silent' in blocked) return { findings: out, warnings: [] as string[] };
    if (blocked) {
      wanted.forEach((f) => { f.verification = skipped(blocked.reason); });
      return { findings: out, warnings: [`verification did not run: ${blocked.reason}`] };
    }
    const { picked, over } = selectForVerify(out, left, (f) => taken.has(findingKey(f)), findingKey);
    over.forEach((i) => { out[i].verification = skipped(OVER_LIMIT); });
    left -= picked.length;
    picked.forEach((i) => taken.add(findingKey(out[i])));
    const todo = picked.map((i) => ({ i, stage: `verify-${++count}` }));
    await run.plan(after, todo.map(({ i, stage }) => [stage, `Reproduce: ${out[i].title}`]));
    const results = await Promise.all(todo.map(({ i, stage }) => slot(() => reproduce(stage, out[i], chapter))));
    todo.forEach(({ i }, n) => { out[i].verification = results[n]; });
    return { findings: out, warnings: results.some((r) => r.status === 'inconclusive') ? ['some findings could not be reproduced here (inconclusive)'] : [] };
  };
}
