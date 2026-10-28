// @ts-check
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { execFileAsync } from './exec.mjs';
import { c, log, warn } from './log.mjs';
import { CLAUDE_BIN, REVIEW_PROMPT_EXTRA, DATA_DIR } from './config.mjs';
import { teamRunExtras } from './team-claude.mjs';
import { withTeamDeny } from './team-plugin.mjs';
import { CLAUDE_ALLOWED_TOOLS, CLAUDE_MR_COMMENTS_ALLOWED_TOOLS } from './allowed-tools.mjs';
import { archiveReview, discussionPrompt, triageDiscussionPrompt } from './history.mjs';
import { listDiscussions } from './gitlab.mjs';
import { branchCheckedOutElsewhere, checkoutMergeRequest } from './worktree.mjs';
import { reviewOutputPath, mrCommentsOutputPath } from './paths.mjs';
import { recordFixes } from './fixes.mjs';
import { claudeArgs, parseRunOutput } from './claude-cli.mjs';
import { runEnv, runSettings } from './run-settings.mjs';
import { contractPrompt, clearStaleReport, buildReport, writeReportFiles } from './report.mjs';
import { appendRun } from './runlog.mjs';
import { trackRun } from './telemetry.mjs';
import { listFields } from './findings.mjs';
import { previousFindingsPrompt } from './previous-findings.mjs';
import { runStreaming } from './progress.mjs';
import { trackRun } from './run-tracker.mjs';
import { buildStackPrompt } from './stack-context.mjs';

// Shared by both flows. `kind` is 'review' (someone else's MR) or 'triage'
// (my own MR, reviewer comments). The command can be anything: the bot injects
// the output contract with --append-system-prompt. Every run is traced (run-tracker.mjs),
// stage by stage, so it can be followed live and read again when it failed.
async function runCommand(mr, opts) {
  const run = await trackRun(mr, opts);
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

  await run.stage('checkout');
  log(mr, 'Checking out MR branch in the bot worktree...');
  await checkoutMergeRequest(mr);
  await clearStaleReport(BOT_WORKTREE_DIR);
  const { stdout: baseSha } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: BOT_WORKTREE_DIR });
  await run.stage('context');
  const stackContext = stack && stack.info.size > 1 ? await buildStackPrompt(mr, stack) : '';
  // A failed fetch must not block the review: it just runs without the conversation.
  const conversation = await listDiscussions(mr.project, mr.iid)
    .then(kind === 'review' ? discussionPrompt : triageDiscussionPrompt, (err) => { warn(mr, `Could not read the MR discussions: ${err.message}`); return ''; });
  // The report this run replaces: its findings keep their ids when they still apply.
  const previous = await readFile(outputPath.replace(/\.md$/, '.findings.json'), 'utf8')
    .then((t) => previousFindingsPrompt(JSON.parse(t).findings ?? []), () => '');
  if (stackContext) log(mr, `Layer ${stack.info.position}/${stack.info.size} of a stack on ${stack.info.baseBranch}.`);

  await run.stage('agent');
  log(mr, `Running ${command} (this can take a few minutes)...`);
  const startedAt = Date.now();
  const systemPrompt = contractPrompt(kind, [REVIEW_PROMPT_EXTRA, stackContext, conversation, previous].filter(Boolean).join('\n\n'), BOT_WORKTREE_DIR);
  const team = await teamRunExtras(DATA_DIR); // --plugin-dir of the synced team skills, if any
  const { stdout, stderr } = await runStreaming(
    CLAUDE_BIN,
    [...claudeArgs({ prompt: `${command} MR !${mr.iid}`, tools, systemPrompt, settings: withTeamDeny(runSettings(mr.project), team) }), ...team.args],
    { cwd: BOT_WORKTREE_DIR, env: runEnv() },
    (step, info) => run.step(step, info),
    (line) => run.event(line),
  );
  log(mr, `${c.green}Claude finished in ${Math.round((Date.now() - startedAt) / 1000)}s.${c.reset}`);

  await run.stage('report');
  const { text, stats } = parseRunOutput(stdout);
  if (stats) run.cost(stats);
  const run = stats ? await appendRun({ project: mr.project.key, iid: mr.iid, kind, command, ...stats }) : null;
  if (stats) log(mr, `Cost: $${stats.costUsd.toFixed(2)}, ${stats.outputTokens} output tokens, ${stats.turns} turns.`);
  const report = await buildReport({ worktreeDir: BOT_WORKTREE_DIR, stdout: text, stderr });
  const { content, source, shape } = report;
  if (source === 'stdout') {
    warn(mr, `${command} did not follow the output contract (no report file, no marker block): saved its raw final message as the report.`);
  }
  if (shape.warnings.length) warn(mr, `Report contract: ${shape.warnings.join(' ')}`);
  if (await archiveReview(outputPath, content)) log(mr, `Previous report kept in ${REVIEWS_DIR}/.history.`);
  await writeReportFiles(outputPath, report, baseSha.trim());

  if (kind === 'triage') await recordFixes(mr, baseSha.trim());
  log(mr, `Report (${source}) written to ${outputPath}. Nothing was posted to GitLab.`);
  if (run) trackRun({ run, report: { source, ...listFields(shape), warnings: shape.warnings.length } });
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
