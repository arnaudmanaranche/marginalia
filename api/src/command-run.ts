import { gitlab } from './gitlab-api.ts';
import { c, log, warn } from './log.ts';
import { CLAUDE_BIN, REVIEW_PROMPT_EXTRA, DATA_DIR } from './config.ts';
import { teamRunExtras } from './team-claude.ts';
import { withTeamDeny } from './team-plugin.ts';
import { artifactOf } from './artifact.ts';
import { discussionPrompt, triageDiscussionPrompt } from './discussion-prompt.ts';
import { claudeArgs, parseRunOutput } from './claude-cli.ts';
import { runEnv, runSettings } from './run-settings.ts';
import { buildReport } from './report.ts';
import { enforceContract } from './guardrail.ts';
import { contractPrompt } from './run-contract.ts';
import { previousFindingsPrompt } from './previous-findings.ts';
import { runStreaming } from './progress.ts';
import { buildStackPrompt } from './stack-context.ts';

// A run of the project's own command (REVIEW_COMMAND / TRIAGE_COMMAND, a slash command of the
// reviewed repo): one Claude call that does the whole job, told the output contract with
// --append-system-prompt, its report read back from whatever it wrote. See pipeline/ for the
// staged runs Marginalia drives itself.
/** @param {{ mr: any, run: any, kind: 'review' | 'triage', command: string, tools: string[], outputPath: string, stack?: any }} input */
export async function commandRun({ mr, run, kind, command, tools, outputPath, stack = null }: { mr: any; run: any; kind: 'review' | 'triage'; command: string; tools: string[]; outputPath: string; stack?: any }) {
  const BOT_WORKTREE_DIR = mr.project.worktreeDir;
  await run.stage('context');
  const stackContext = stack && stack.info.size > 1 ? await buildStackPrompt(mr, stack) : '';
  // A failed fetch must not block the review: it just runs without the conversation.
  const conversation = await gitlab.listDiscussions(mr.project, mr.iid)
    .then(kind === 'review' ? discussionPrompt : triageDiscussionPrompt, (err) => { warn(mr, `Could not read the MR discussions: ${err.message}`); return ''; });
  // The report this run replaces: its findings keep their ids when they still apply.
  const previous = previousFindingsPrompt(await artifactOf(outputPath).previousFindings());
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
  if (stats) run.addCost(stats);
  const report = await buildReport({ worktreeDir: BOT_WORKTREE_DIR, stdout: text, stderr });
  enforceContract(kind, report.findingsRaw);
  return report;
}
