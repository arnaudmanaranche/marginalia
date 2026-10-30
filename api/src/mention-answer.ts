import { CLAUDE_BIN } from './config.ts';
import { claudeArgs, parseRunOutput } from './claude-cli.ts';
import { gitlab } from './gitlab-api.ts';
import { MENTION_SYSTEM, MENTION_TOOLS, mentionPrompt } from './mention-prompt.ts';
import { runStreaming } from './progress.ts';
import { runEnv, runSettings } from './run-settings.ts';
import { appendRun } from './runlog.ts';
import { branchCheckedOutElsewhere, checkoutMergeRequest } from './worktree.ts';
import type { Mention } from './mention.ts';

const TIMEOUT_MS = 240_000;

// One question or follow-up in a thread: a headless, read-only Claude on the MR branch, under the
// same sandbox and environment scrubbing as a review. The answer is returned; the intake posts it.
export async function answerMention(mr: any, mention: Mention): Promise<string> {
  if (await branchCheckedOutElsewhere(mr.project, mr.source_branch)) throw new Error(`Branch "${mr.source_branch}" is checked out in another worktree`);
  await checkoutMergeRequest(mr);
  const thread = (await gitlab.listDiscussions(mr.project, mr.iid)).find((d: any) => d.id === mention.discussionId)?.notes ?? [];
  const text = mention.invocation.kind === 'question' || mention.invocation.kind === 'followup' ? mention.invocation.text : '';
  const { stdout } = await runStreaming(
    CLAUDE_BIN,
    claudeArgs({ prompt: mentionPrompt(mr, thread.map((n: any) => ({ author: n.author ?? '?', body: n.body })), text), tools: MENTION_TOOLS, systemPrompt: MENTION_SYSTEM, settings: runSettings(mr.project) }),
    { cwd: mr.project.worktreeDir, timeout: TIMEOUT_MS, env: runEnv() },
  );
  const { text: answer, stats } = parseRunOutput(stdout);
  if (stats) await appendRun({ project: mr.project.key, iid: mr.iid, kind: 'chat', command: 'mention', ...stats });
  if (!answer.trim()) throw new Error('Claude returned no answer');
  return answer.trim();
}
