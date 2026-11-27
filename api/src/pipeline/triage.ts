import { ReplyVerdict } from '@worldia/marginalia-contract';
import { committerIn } from '../git-identity.ts';
import { gitIn } from '../git.ts';
import { cleanWorktree, head, resetHard } from '../git-refs.ts';
import { THREAD_TRAILER } from '../fixes-log.ts';
import { STAGE_FIX_TOOLS, STAGE_READ_TOOLS } from '../allowed-tools.ts';
import { mrCommentsOutputPath } from '../paths.ts';
import { agentStage } from './agent-stage.ts';
import { settleConflicts } from './conflicts.ts';
import { codeAround, gatherContext } from './context.ts';
import { contextText } from './context-text.ts';
import { renderTriage } from './report-render.ts';
import { fixPrompt, judgePrompt, parseFix, parseJudge } from './triage-prompts.ts';
import { methodsLine, resolveMethods } from '../prompt-source.ts';

const place = (t: any) => (t?.path ? `${t.path}${t.line ? `:${t.line}` : ''}` : 'general comment');
const VERDICT: Record<string, string> = { already_fixed: ReplyVerdict.enum.already_fixed, not_relevant: ReplyVerdict.enum.not_relevant, wrong: ReplyVerdict.enum.wrong, answer: ReplyVerdict.enum.answered };

// Marginalia's own triage of my MR, in stages a person can follow: the bot gathers the open
// reviewer threads with the code they are about, merges the target in when the MR conflicts with
// it, one agent weighs the threads, then one agent per thread to fix makes that fix, which the bot
// commits on its own, so each fix can be pushed and answered thread by thread.
export async function stagedTriage({ mr, run, settings }: { mr: any; run: any; settings: object | null }) {
  const cwd = mr.project.worktreeDir;
  await run.stage('context');
  const { context, threads } = await gatherContext(mr, { outputPath: mrCommentsOutputPath(mr) });
  const open = threads.filter((t: any) => !t.resolved && t.notes.length && !t.notes[0].mine && !t.notes[0].bot);
  for (const t of open as any[]) t.code = await codeAround(cwd, t.path, t.line);
  run.step(`${open.length} open reviewer thread(s), ${context.files.length} changed files`, { stage: 'context' });
  // The threads are listed on their own, with their ids: the conversation would say them twice.
  const text = contextText({ ...context, conversation: '', previous: '' });
  const mrInfo = { title: mr.title, iid: mr.iid, branch: mr.source_branch };
  // One version of each stage method for the whole run (ADR 0014).
  const methods = await resolveMethods(['triage-system', 'triage-judge', 'triage-fix', 'triage-conflict']);
  run.step(methodsLine(Object.values(methods)), { stage: 'context' });
  const system = methods['triage-system'];
  const conflicts = await settleConflicts({ mr, run, context: text, settings, methods: [methods['triage-conflict'], system] });
  const warnings = conflicts?.error ? [`The MR conflicts with ${mr.target_branch} and the triage could not settle it (${conflicts.error})`] : [];
  if (!open.length) {
    await run.stage('report');
    const data = { summary: 'No open reviewer thread to answer.', replies: [] };
    return { content: renderTriage(mrInfo, [], data, conflicts), findingsRaw: JSON.stringify(data), warnings };
  }

  await run.stage('judge');
  const verdicts = await agentStage({ run, stage: 'judge', prompt: judgePrompt({ context: text, threads: open, method: methods['triage-judge'].text }), system: system.text, methods: [methods['triage-judge'], system], tools: STAGE_READ_TOOLS, cwd, settings, parse: (t: string) => parseJudge(t, open.map((x: any) => x.id)) });
  for (const v of verdicts) run.step(`${place(open.find((t: any) => t.id === v.thread))}: ${v.verdict.replace('_', ' ')}. ${v.why}`, { stage: 'judge' });
  const toFix = verdicts.filter((v: any) => v.verdict === 'fix');
  const ids = toFix.map((_: any, i: number) => `fix-${i + 1}`);
  await run.plan('judge', toFix.map((v: any, i: number) => [ids[i], `Fix: ${place(open.find((t: any) => t.id === v.thread))}`]));
  await run.end('judge');

  const replies = verdicts.filter((v: any) => v.verdict !== 'fix').map((v: any) => ({ thread: v.thread, verdict: VERDICT[v.verdict], reply: v.reply, resolve: VERDICT[v.verdict] === ReplyVerdict.enum.already_fixed, why: v.why }));
  // One after the other: they change the same tree, and each commit must hold one fix only.
  for (const [i, v] of toFix.entries()) {
    const thread: any = open.find((t: any) => t.id === v.thread);
    await run.begin(ids[i]);
    const git = gitIn(cwd);
    const before = await head(cwd);
    try {
      const done = await agentStage({ run, stage: ids[i], prompt: fixPrompt({ context: text, thread, plan: v.plan, method: methods['triage-fix'].text }), system: system.text, methods: [methods['triage-fix'], system], tools: STAGE_FIX_TOOLS, cwd, settings, parse: parseFix });
      // The bot commits the fix, one commit with the thread in its trailer. A commit the agent made
      // anyway is folded back into it.
      await git.run('reset', '--soft', '-q', before);
      if (await git.run('status', '--porcelain')) {
        await git.run('add', '-A');
        await (await committerIn(cwd)).run('commit', '-q', '-m', `fix: ${done.what || 'review comment'}`, '-m', `${THREAD_TRAILER}: ${thread.id}`);
      }
      const after = await head(cwd);
      const commit = after !== before ? after : null;
      replies.push({ thread: v.thread, verdict: commit ? 'fixed' : 'answered', reply: done.reply, resolve: Boolean(commit), ...(commit && { commit }), why: done.what || v.why });
      run.step(commit ? `Committed ${commit.slice(0, 8)}: ${done.what}` : 'Nothing changed: answered instead.', { stage: ids[i] });
      await run.end(ids[i]);
    } catch (err) {
      // A fix that failed half way must not end up in the next one's commit.
      await resetHard(cwd, before);
      await cleanWorktree(cwd);
      await run.end(ids[i], 'failed');
      warnings.push(`The fix for ${place(thread)} failed (${String(err.message).slice(0, 160)}): no reply drafted for it`);
    }
  }

  await run.stage('report');
  const fixed = replies.filter((r: any) => r.verdict === 'fixed').length;
  const data = { summary: `${replies.length} of ${open.length} threads answered, ${fixed} fixed in their own commit.`, replies };
  return { content: renderTriage(mrInfo, open, data, conflicts), findingsRaw: JSON.stringify(data), warnings };
}
