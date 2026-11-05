import { basename } from 'node:path';
import { head } from './git-refs.ts';
import { c, log, warn } from './log.ts';
import { artifactOf } from './artifact.ts';
import { branchCheckedOutElsewhere, checkoutMergeRequest } from './worktree.ts';
import { reviewOutputPath, mrCommentsOutputPath } from './paths.ts';
import { recordFixes } from './fixes.ts';
import { appendRun } from './runlog.ts';
import { trackRun } from './telemetry.ts';
import { listFields } from './findings.ts';
import { followRun } from './run-tracker.ts';
import { preflight } from './preflight.ts';
import { PIPELINE, stagedRun } from './pipeline/staged.ts';
import { recordFixedBefore } from './own-fixed.ts';

// Shared by both flows. `kind` is 'review' (someone else's MR) or 'triage' (my own MR, reviewer
// comments). The work is done by Marginalia's staged pipeline (pipeline/). Every run is traced
// (run-tracker.ts), stage by stage, so it can be followed live and read again when it failed.
async function runCommand(mr: any, opts: any) {
  const run = await followRun(mr, { ...opts, command: PIPELINE });
  try {
    const outcome = await runStages(mr, opts, run);
    await run.finish(outcome, outcome === 'skipped' ? `Branch "${mr.source_branch}" is checked out in another worktree.` : null);
    return outcome;
  } catch (err) {
    await run.finish('failed', err.message);
    // Which run failed, so the poller can hand it to the doctor.
    err.run = { id: run.id, fileSlug: basename(opts.outputPath, '.md') };
    throw err;
  }
}

async function runStages(mr: any, { kind, outputPath, label, stack = null, detached = false }: any, run: any) {
  const { worktreeDir: BOT_WORKTREE_DIR, reviewsDir: REVIEWS_DIR } = mr.project;
  log(mr, `Starting ${label}: ${c.bold}"${mr.title}"${c.reset} (${mr.source_branch} -> ${mr.target_branch})`);

  if (!detached && (await branchCheckedOutElsewhere(mr.project, mr.source_branch))) {
    warn(mr, `Branch "${mr.source_branch}" is checked out in another worktree, skipping this pass.`);
    return 'skipped';
  }

  await preflight(mr, { kind, run });
  await run.stage('checkout');
  log(mr, `Checking out ${mr.iid === null ? 'the branch' : 'MR branch'} in the bot worktree...`);
  await checkoutMergeRequest(mr, { detached });
  const baseSha = await head(BOT_WORKTREE_DIR);

  const report = await stagedRun({ mr, run, kind, outputPath, stack });
  const { content, source, shape } = report;
  const cost = run.cost;
  const row = cost ? await appendRun({ project: mr.project.key, iid: mr.iid, kind, command: PIPELINE, costUsd: cost.usd, outputTokens: cost.outputTokens, turns: cost.turns, durationMs: Date.now() - Date.parse(run.startedAt) }) : null;
  if (cost) log(mr, `Cost: $${cost.usd.toFixed(2)}, ${cost.outputTokens} output tokens, ${cost.turns} turns.`);
  if (shape.warnings.length) warn(mr, `Report contract: ${shape.warnings.join(' ')}`);
  // An own review replaces the last one: first, which of its findings did this push fix?
  if (detached) await recordFixedBefore({ project: mr.project, slug: basename(outputPath, '.md'), newSha: baseSha, iid: mr.iid });
  if (await artifactOf(outputPath).write(report, baseSha)) log(mr, `Previous report kept in ${REVIEWS_DIR}/.history.`);

  if (kind === 'triage') await recordFixes(mr, baseSha);
  log(mr, `Report (${source}) written to ${outputPath}. Nothing was posted to GitLab.`);
  if (row) trackRun({ run: row, report: { source, ...listFields(shape), warnings: shape.warnings.length, own: detached, criticalPaths: (shape.criticalPaths ?? []).length } });
  return 'reviewed';
}

// `own`: an own review (my MR or branch), read from a detached checkout.
export function runReview(mr: any, outputPath = reviewOutputPath(mr), stack = /** @type {any} */ (null), { own = false }: { own?: boolean } = {}) {
  return runCommand(mr, {
    stack,
    detached: own,
    kind: 'review',
    outputPath,
    label: 'review',
  });
}

export function runMrComments(mr: any) {
  return runCommand(mr, {
    kind: 'triage',
    outputPath: mrCommentsOutputPath(mr),
    label: 'comment triage',
  });
}
