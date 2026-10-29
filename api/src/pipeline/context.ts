import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gitIn } from '../git.ts';
import { head as headOf } from '../git-refs.ts';
import { warn } from '../log.ts';
import { gitlab } from '../gitlab-api.ts';
import { artifactOf } from '../artifact.ts';
import { discussionPrompt } from '../discussion-prompt.ts';
import { jiraTicketOf } from '../jira.ts';
import { previousFindingsPrompt } from '../previous-findings.ts';
import { buildStackPrompt } from '../stack-context.ts';
import { GUIDANCE_FILES, parseNumstat } from './context-text.ts';

// Everything the agents of a staged run are told about the MR, read by the bot: the diff from where
// the branch left its target, the ticket, the repo's rules files, the conversation and the last
// report. A source that fails (GitLab, Jira) is left out with a warning, never fatal.
/** @param {any} mr @param {{ outputPath: string, stack?: any }} opts */
export async function gatherContext(mr, { outputPath, stack = null }) {
  const cwd = mr.project.worktreeDir;
  const git = gitIn(cwd);
  const base = await git.run('merge-base', `origin/${mr.target_branch}`, 'HEAD');
  const [head, numstat, threads, ticket, previous, stackText] = await Promise.all([
    headOf(cwd),
    git.run('diff', '--numstat', base, 'HEAD'),
    gitlab.listDiscussions(mr.project, mr.iid).catch((err) => {
      warn(mr, `Could not read the MR discussions: ${err.message}`);
      return [];
    }),
    jiraTicketOf(mr),
    artifactOf(outputPath).previousFindings().then(previousFindingsPrompt),
    stack && stack.info.size > 1 ? buildStackPrompt(mr, stack) : Promise.resolve(''),
  ]);
  return {
    context: {
      mr: { iid: mr.iid, title: mr.title, author: mr.author?.username ?? null, description: mr.description ?? null, source: mr.source_branch, target: mr.target_branch, url: mr.web_url ?? null },
      base, head,
      files: parseNumstat(numstat),
      ticket,
      guidance: GUIDANCE_FILES.filter((f) => existsSync(join(cwd, f))),
      conversation: discussionPrompt(threads),
      previous,
      stack: stackText,
    },
    threads,
  };
}

// The lines around `line` of a file at head, numbered, for a reviewer thread to be judged with the
// code it is about. Null when the file or the line is gone.
/** @param {string} cwd @param {string | null} path @param {number | null} line */
export async function codeAround(cwd, path, line, around = 8) {
  if (!path || !line) return null;
  try {
    const lines = (await readFile(join(cwd, path), 'utf8')).split('\n');
    if (line > lines.length) return null;
    const from = Math.max(1, line - around);
    return lines.slice(from - 1, line + around).map((l, i) => `${String(from + i).padStart(5)}${from + i === line ? '>' : ' '} ${l}`).join('\n');
  } catch {
    return null;
  }
}
