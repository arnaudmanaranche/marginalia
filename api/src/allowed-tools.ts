import { CLAUDE_EXTRA_ALLOWED_TOOLS } from './config.ts';
import { CONNECTOR_READ_TOOLS, withoutConnectorWrites } from './connector-tools.ts';

// The tools each headless run may use, passed to `claude --allowedTools`.

// Git subcommands, one rule each: a blanket `Bash(git:*)` would also allow
// `git -c alias.x='!sh ...'`, `git config` and friends, which run arbitrary code.
// These are what reading a diff and its history takes. A refused command fails the
// run with its name in the error: add it to CLAUDE_EXTRA_ALLOWED_TOOLS as `Bash(git <sub>:*)`.
const READ_GIT = [
  'diff', 'log', 'show', 'status', 'rev-parse', 'rev-list', 'merge-base', 'ls-files',
  'ls-tree', 'cat-file', 'blame', 'grep', 'show-ref', 'for-each-ref', 'symbolic-ref',
  'describe', 'name-rev', 'shortlog', 'diff-tree', 'remote get-url',
  'branch --show-current', 'branch --list', 'branch -a', 'branch -r',
].map((sub) => `Bash(git ${sub}:*)`);

// CLAUDE_EXTRA_ALLOWED_TOOLS (space-separated) is added to every list, less any connector write.
const extraTools = withoutConnectorWrites(CLAUDE_EXTRA_ALLOWED_TOOLS.split(/\s+/).filter(Boolean));

// The stages of the staged pipelines (pipeline/) get only what their job takes. The bot has
// already checked out the MR and fetched its target, so no stage fetches, nests a worktree or
// starts a sub-agent. The connectors are read-only (connector-tools.ts): the ticket the bot could
// not read itself, a spec in Notion, a thread in Slack, the MR in GitLab.
export const STAGE_READ_TOOLS = ['Read', 'Grep', 'Glob', ...READ_GIT, ...CONNECTOR_READ_TOOLS, ...extraTools];
// Fixing a reviewer comment on my own MR, or settling a merge's conflicts: edit only. The bot
// commits what the stage changed, so each commit holds one stage's work under a known message.
export const STAGE_FIX_TOOLS = [...STAGE_READ_TOOLS, 'Edit', 'Write'];

// An Understand job reads the repo at its default branch and the connectors, and writes only its
// context file (the sandbox keeps writes in its worktree). It neither fetches nor nests worktrees.
export const UNDERSTAND_TOOLS = ['Read', 'Grep', 'Glob', 'Write', ...READ_GIT, ...CONNECTOR_READ_TOOLS, ...extraTools];
