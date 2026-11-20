import { tmpdir } from 'node:os';
import { CHAT_SYSTEM, CHAT_TOOLS } from './chat-prompt.ts';
import { claudeArgs } from './claude-cli.ts';
import { runClaudeOnce } from './run-claude-once.ts';
import { runSettings } from './run-settings.ts';
import { hasCommit, withScratchWorktree } from './scratch-worktree.ts';

const TIMEOUT_MS = 180_000;

// One question to a headless, read-only Claude about a stop of a review. Same
// sandbox, deny rules and environment scrubbing as the review runs; the answer
// is returned, never posted. It reads the code at the commit the review read
// (`sha`), in a worktree of its own: the bot worktree belongs to the project's
// queue lane and may hold another MR by now. Without that commit, only the
// stop's diff in the prompt.
export async function askAboutStop({ project, iid, sha, prompt }: { project: any; iid: any; sha: string | null; prompt: string }) {
  const ask = async (cwd: string) => {
    const { text } = await runClaudeOnce({
      args: claudeArgs({ prompt, tools: CHAT_TOOLS, systemPrompt: CHAT_SYSTEM, settings: runSettings({ ...project, worktreeDir: cwd }) }),
      cwd,
      timeout: TIMEOUT_MS,
      meta: { name: 'chat', kind: 'chat', project: project.key },
      log: { project: project.key, iid, kind: 'chat', command: 'chat' },
    });
    if (!text.trim()) throw new Error('Claude returned no answer');
    return text.trim();
  };
  if (sha && (await hasCommit(project.repoPath, sha))) return withScratchWorktree(project.repoPath, sha, ask);
  return ask(tmpdir());
}
