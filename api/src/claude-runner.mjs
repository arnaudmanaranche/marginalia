// @ts-check
import { basename } from 'node:path';
import { head } from './git-refs.mjs';
import { c, log, warn } from './log.mjs';
import { CLAUDE_ALLOWED_TOOLS, CLAUDE_MR_COMMENTS_ALLOWED_TOOLS } from './allowed-tools.mjs';
import { artifactOf } from './artifact.mjs';
import { branchCheckedOutElsewhere, checkoutMergeRequest } from './worktree.mjs';
import { reviewOutputPath, mrCommentsOutputPath } from './paths.mjs';
import { recordFixes } from './fixes.mjs';
import { clearStaleReport } from './report.mjs';
import { appendRun } from './runlog.mjs';
import { trackRun } from './telemetry.mjs';
import { listFields } from './findings.mjs';
import { followRun } from './run-tracker.mjs';
import { commandRun } from './command-run.mjs';
import { preflight } from './preflight.mjs';
import { isStaged, stagedRun } from './pipeline/staged.mjs';

// Shared by both flows. `kind` is 'review' (someone else's MR) or 'triage' (my own MR, reviewer
// comments). The work is done by the project's command (command-run.mjs) or, when it is
// `marginalia`, by Marginalia's staged pipeline (pipeline/). Every run is traced (run-tracker.mjs),
// stage by stage, so it can be followed live and read again when it failed.
async function runCommand(mr, opts) {
  const run = await followRun(mr, { ...opts, plan: isStaged(opts.command) ? `staged-${opts.kind}` : opts.kind });
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

async function runStages(mr, { kind, command, tools, outputPath, label, stack = /** @type {any} */ (null) }, run) {
  const { worktreeDir: BOT_WORKTREE_DIR, reviewsDir: REVIEWS_DIR } = mr.project;
  log(mr, `Starting ${label}: ${c.bold}"${mr.title}"${c.reset} (${mr.source_branch} -> ${mr.target_branch})`);

  if (await branchCheckedOutElsewhere(mr.project, mr.source_branch)) {
    warn(mr, `Branch "${mr.source_branch}" is checked out in another worktree, skipping this pass.`);
    return 'skipped';
  }

  await preflight(mr, { kind, run });
  await run.stage('checkout');
  log(mr, 'Checking out MR branch in the bot worktree...');
  await checkoutMergeRequest(mr);
  await clearStaleReport(BOT_WORKTREE_DIR);
  const baseSha = await head(BOT_WORKTREE_DIR);

  const report = isStaged(command)
    ? await stagedRun({ mr, run, kind, outputPath, stack })
    : await commandRun({ mr, run, kind, command, tools, outputPath, stack });
  const { content, source, shape } = report;
  const cost = run.cost;
  const row = cost ? await appendRun({ project: mr.project.key, iid: mr.iid, kind, command, costUsd: cost.usd, outputTokens: cost.outputTokens, turns: cost.turns, durationMs: Date.now() - Date.parse(run.startedAt) }) : null;
  if (cost) log(mr, `Cost: $${cost.usd.toFixed(2)}, ${cost.outputTokens} output tokens, ${cost.turns} turns.`);
  if (shape.warnings.length) warn(mr, `Report contract: ${shape.warnings.join(' ')}`);
  if (await artifactOf(outputPath).write(report, baseSha)) log(mr, `Previous report kept in ${REVIEWS_DIR}/.history.`);

  if (kind === 'triage') await recordFixes(mr, baseSha);
  log(mr, `Report (${source}) written to ${outputPath}. Nothing was posted to GitLab.`);
  if (row) trackRun({ run: row, report: { source, ...listFields(shape), warnings: shape.warnings.length } });
  return 'reviewed';
}

export function runReview(mr, outputPath = reviewOutputPath(mr), stack = /** @type {any} */ (null)) {
  return runCommand(mr, {
    stack,
    kind: 'review',
    command: mr.project.reviewCommand,
    tools: CLAUDE_ALLOWED_TOOLS,
    outputPath,
    label: 'review',
  });
}

export function runMrComments(mr) {
  return runCommand(mr, {
    kind: 'triage',
    command: mr.project.triageCommand,
    tools: CLAUDE_MR_COMMENTS_ALLOWED_TOOLS,
    outputPath: mrCommentsOutputPath(mr),
    label: 'comment triage',
  });
}
