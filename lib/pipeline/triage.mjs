// @ts-check
import { execFileAsync } from '../exec.mjs';
import { commitEnv } from '../git-identity.mjs';
import { THREAD_TRAILER } from '../fixes-log.mjs';
import { STAGE_FIX_TOOLS, STAGE_READ_TOOLS } from '../allowed-tools.mjs';
import { mrCommentsOutputPath } from '../paths.mjs';
import { agentStage } from './agent-stage.mjs';
import { settleConflicts } from './conflicts.mjs';
import { codeAround, gatherContext } from './context.mjs';
import { contextText } from './context-text.mjs';
import { renderTriage } from './report-render.mjs';
import { TRIAGE_SYSTEM, fixPrompt, judgePrompt, parseFix, parseJudge } from './triage-prompts.mjs';

// Commits are made as me (git-identity.mjs): they are pushed under my name.
const git = async (cwd, args) => execFileAsync('git', args, { cwd, ...(args[0] === 'commit' && { env: await commitEnv() }) }).then((r) => String(r.stdout).trim());
const place = (t) => (t?.path ? `${t.path}${t.line ? `:${t.line}` : ''}` : 'general comment');
const VERDICT = { already_fixed: 'already_fixed', not_relevant: 'not_relevant', wrong: 'wrong', answer: 'answered' };

// Marginalia's own triage of my MR, in stages a person can follow: the bot gathers the open
// reviewer threads with the code they are about, merges the target in when the MR conflicts with
// it, one agent weighs the threads, then one agent per thread to fix makes that fix, which the bot
// commits on its own, so each fix can be pushed and answered thread by thread.
/** @param {{ mr: any, run: any, settings: object | null }} input */
export async function stagedTriage({ mr, run, settings }) {
  const cwd = mr.project.worktreeDir;
  await run.stage('context');
  const { context, threads } = await gatherContext(mr, { outputPath: mrCommentsOutputPath(mr) });
  const open = threads.filter((t) => !t.resolved && t.notes.length && !t.notes[0].mine && !t.notes[0].bot);
  for (const t of open) t.code = await codeAround(cwd, t.path, t.line);
  run.step(`${open.length} open reviewer thread(s), ${context.files.length} changed files`, { stage: 'context' });
  // The threads are listed on their own, with their ids: the conversation would say them twice.
  const text = contextText({ ...context, conversation: '', previous: '' });
  const mrInfo = { title: mr.title, iid: mr.iid, branch: mr.source_branch };
  const conflicts = await settleConflicts({ mr, run, context: text, settings });
  const warnings = conflicts?.error ? [`The MR conflicts with ${mr.target_branch} and the triage could not settle it (${conflicts.error})`] : [];
  if (!open.length) {
    await run.stage('report');
    const data = { summary: 'No open reviewer thread to answer.', replies: [] };
    return { content: renderTriage(mrInfo, [], data, conflicts), findingsRaw: JSON.stringify(data), warnings };
  }

  await run.stage('judge');
  const verdicts = await agentStage({ run, stage: 'judge', prompt: judgePrompt({ context: text, threads: open }), system: TRIAGE_SYSTEM, tools: STAGE_READ_TOOLS, cwd, settings, parse: (t) => parseJudge(t, open.map((x) => x.id)) });
  for (const v of verdicts) run.step(`${place(open.find((t) => t.id === v.thread))}: ${v.verdict.replace('_', ' ')}. ${v.why}`, { stage: 'judge' });
  const toFix = verdicts.filter((v) => v.verdict === 'fix');
  const ids = toFix.map((_, i) => `fix-${i + 1}`);
  await run.plan('judge', toFix.map((v, i) => [ids[i], `Fix: ${place(open.find((t) => t.id === v.thread))}`]));
  await run.end('judge');

  const replies = verdicts.filter((v) => v.verdict !== 'fix').map((v) => ({ thread: v.thread, verdict: VERDICT[v.verdict], reply: v.reply, resolve: v.verdict === 'already_fixed', why: v.why }));
  // One after the other: they change the same tree, and each commit must hold one fix only.
  for (const [i, v] of toFix.entries()) {
    const thread = open.find((t) => t.id === v.thread);
    await run.begin(ids[i]);
    const before = await git(cwd, ['rev-parse', 'HEAD']);
    try {
      const done = await agentStage({ run, stage: ids[i], prompt: fixPrompt({ context: text, thread, plan: v.plan }), system: TRIAGE_SYSTEM, tools: STAGE_FIX_TOOLS, cwd, settings, parse: parseFix });
      // The bot commits the fix, one commit with the thread in its trailer. A commit the agent made
      // anyway is folded back into it.
      await git(cwd, ['reset', '--soft', '-q', before]);
      if (await git(cwd, ['status', '--porcelain'])) {
        await git(cwd, ['add', '-A']);
        await git(cwd, ['commit', '-q', '-m', `fix: ${done.what || 'review comment'}`, '-m', `${THREAD_TRAILER}: ${thread.id}`]);
      }
      const after = await git(cwd, ['rev-parse', 'HEAD']);
      const commit = after !== before ? after : null;
      replies.push({ thread: v.thread, verdict: commit ? 'fixed' : 'answered', reply: done.reply, resolve: Boolean(commit), ...(commit && { commit }), why: done.what || v.why });
      run.step(commit ? `Committed ${commit.slice(0, 8)}: ${done.what}` : 'Nothing changed: answered instead.', { stage: ids[i] });
      await run.end(ids[i]);
    } catch (err) {
      // A fix that failed half way must not end up in the next one's commit.
      await git(cwd, ['reset', '--hard', '-q', before]);
      await git(cwd, ['clean', '-fdq', '-e', '.claude']);
      await run.end(ids[i], 'failed');
      warnings.push(`The fix for ${place(thread)} failed (${String(err.message).slice(0, 160)}): no reply drafted for it`);
    }
  }

  await run.stage('report');
  const fixed = replies.filter((r) => r.verdict === 'fixed').length;
  const data = { summary: `${replies.length} of ${open.length} threads answered, ${fixed} fixed in their own commit.`, replies };
  return { content: renderTriage(mrInfo, open, data, conflicts), findingsRaw: JSON.stringify(data), warnings };
}
