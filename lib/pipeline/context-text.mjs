// @ts-check
// What every agent of a staged run is told about the MR, gathered by the bot in code (context.mjs)
// so no agent spends turns or connectors fetching it. Pure: tested on plain values.

// Files a repo writes its own rules in, read by the agents before they judge anything.
export const GUIDANCE_FILES = ['CLAUDE.md', 'AGENTS.md', 'CONTRIBUTING.md', '.github/CONTRIBUTING.md', 'docs/adr', '.claude/agents/code-reviewer.md'];

const MAX_DESCRIPTION = 4000;
const MAX_FILES = 300;

// `git diff --numstat` as [{ path, added, removed }] (a binary file counts 0 and 0).
/** @param {string} out */
export function parseNumstat(out) {
  return out.split('\n').filter(Boolean).map((line) => {
    const [a, r, ...rest] = line.split('\t');
    const raw = rest.join('\t');
    // A rename reads "old => new" or "dir/{old => new}/file": the new path is the one to review.
    const path = raw.includes('=>') ? raw.replace(/\{[^}]*=> ([^}]*)\}/, '$1').replace(/^.* => /, '').replace(/\/\//g, '/') : raw;
    return { path, added: Number(a) || 0, removed: Number(r) || 0 };
  });
}

// The files `git merge-tree --write-tree --name-only` reports conflicted: after the tree id, one
// per line, up to the blank line before its messages.
/** @param {string} out */
export function parseMergeTree(out) {
  const [, ...rest] = out.split('\n');
  const end = rest.indexOf('');
  return [...new Set(end < 0 ? rest : rest.slice(0, end))].filter(Boolean);
}

/**
 * @typedef {{
 *   mr: { iid: number | string, title: string, author: string | null, description: string | null, source: string, target: string, url: string | null },
 *   base: string, head: string, files: { path: string, added: number, removed: number }[],
 *   ticket: { key: string, summary: string | null, text: string | null } | null,
 *   guidance: string[], conversation: string, previous: string, stack: string,
 * }} Context
 */

/** @param {Context} ctx */
export function contextText(ctx) {
  const { mr, files } = ctx;
  const added = files.reduce((n, f) => n + f.added, 0);
  const removed = files.reduce((n, f) => n + f.removed, 0);
  const listed = files.slice(0, MAX_FILES).map((f) => `- ${f.path} (+${f.added} -${f.removed})`);
  return [
    '## The merge request',
    `!${mr.iid} "${mr.title}"${mr.author ? ` by ${mr.author}` : ''}: ${mr.source} → ${mr.target}`,
    mr.description?.trim() ? mr.description.trim().slice(0, MAX_DESCRIPTION) : '(no description)',
    '',
    '## The ticket',
    !ctx.ticket ? 'The MR names no ticket.'
      : ctx.ticket.text || ctx.ticket.summary ? `${ctx.ticket.key}: ${ctx.ticket.summary ?? ''}\n${ctx.ticket.text ?? ''}`.trim()
      : `The MR names ${ctx.ticket.key}, which the bot could not read: read it with the Jira tool if you have one, else go without.`,
    '',
    '## What changed',
    `Diff base ${ctx.base} (where the branch left ${mr.target}), head ${ctx.head}. Read one file's change with \`git diff ${ctx.base} HEAD -- <path>\`, the whole file at head with Read.`,
    `${files.length} files, +${added} -${removed}:`,
    ...listed,
    ...(files.length > MAX_FILES ? [`… and ${files.length - MAX_FILES} more (\`git diff --stat ${ctx.base} HEAD\`).`] : []),
    '',
    '## The repo\'s own rules',
    ctx.guidance.length ? `Read these before judging, they are the standard: ${ctx.guidance.join(', ')}.` : 'The repo has no rules file: judge against the code next to the change.',
    ...(ctx.stack ? ['', '## Stack', ctx.stack] : []),
    ...(ctx.conversation ? ['', '## Conversation so far', ctx.conversation] : []),
    ...(ctx.previous ? ['', '## The last report', ctx.previous] : []),
  ].join('\n');
}
