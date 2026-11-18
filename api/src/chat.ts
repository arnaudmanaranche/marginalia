import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { CHAT_SYSTEM, CHAT_TOOLS } from './chat-prompt.ts';
import { claudeArgs } from './claude-cli.ts';
import { runClaudeOnce } from './run-claude-once.ts';
import { runSettings } from './run-settings.ts';

const TIMEOUT_MS = 180_000;

// One question to a headless, read-only Claude about a stop of a review. Same
// sandbox, deny rules and environment scrubbing as the review runs; the answer
// is returned, never posted. Runs in the bot's checkout when there is one.
export async function askAboutStop({ project, iid, prompt }: { project: any; iid: any; prompt: string }) {
  const cwd = existsSync(project.worktreeDir) ? project.worktreeDir : tmpdir();
  const { text } = await runClaudeOnce({
    args: claudeArgs({ prompt, tools: CHAT_TOOLS, systemPrompt: CHAT_SYSTEM, settings: runSettings(project) }),
    cwd,
    timeout: TIMEOUT_MS,
    meta: { name: 'chat', kind: 'chat', project: project.key },
    log: { project: project.key, iid, kind: 'chat', command: 'chat' },
  });
  if (!text.trim()) throw new Error('Claude returned no answer');
  return text.trim();
}
