import { CLAUDE_EXTRA_ALLOWED_TOOLS } from './config.ts';
import { CONNECTOR_READ_TOOLS, TICKET_READ_TOOLS, withoutConnectorWrites } from './connector-tools.ts';

// The tools each headless run may use, passed to `claude --allowedTools`.

// Git subcommands, one rule each: a blanket `Bash(git:*)` would also allow
// `git -c alias.x='!sh ...'`, `git config` and friends, which run arbitrary code.
// These are what reading a diff and its history takes (plus the nested worktree
// the review command creates). A refused command fails the run with its name in
// the error: add it to CLAUDE_EXTRA_ALLOWED_TOOLS as `Bash(git <sub>:*)`.
const READ_GIT = [
  'diff', 'log', 'show', 'status', 'rev-parse', 'rev-list', 'merge-base', 'ls-files',
  'ls-tree', 'cat-file', 'blame', 'grep', 'show-ref', 'for-each-ref', 'symbolic-ref',
  'describe', 'name-rev', 'shortlog', 'diff-tree', 'fetch', 'remote get-url',
  'branch --show-current', 'branch --list', 'branch -a', 'branch -r',
  'worktree list', 'worktree add', 'worktree remove', 'worktree prune',
].map((sub) => `Bash(git ${sub}:*)`);

// The triage also commits its fixes locally (never pushed).
const WRITE_GIT = ['add', 'commit', 'checkout', 'switch', 'restore', 'stash'].map((sub) => `Bash(git ${sub}:*)`);

// The /code-review command needs to orchestrate a nested worktree, spawn the
// code-reviewer agent, and read the ticket, the MR, specs and team threads through
// the claude.ai connectors (read-only, see connector-tools.ts).
const BASE_TOOLS = [
  'Agent',
  'EnterWorktree',
  'ExitWorktree',
  'Read',
  'Grep',
  'Glob',
  'Write',
  ...READ_GIT,
  ...CONNECTOR_READ_TOOLS,
];

// /mr-comments needs more than /code-review: it edits files directly instead
// of only reading/writing the report, and it calls preflight-access/humanizer
// (Skill) plus the self-hosted GitLab MCP server for discussion threads (the
// claude_ai_Gitlab connector doesn't expose those). The exact discussion-read
// tool name isn't documented anywhere in the command files — if a run fails
// on a missing tool, check the error for the tool name and add it here.
const MR_COMMENTS_TOOLS = [
  ...BASE_TOOLS,
  ...WRITE_GIT,
  'Edit',
  'Skill',
  'mcp__GitLab__authenticate',
];

// CLAUDE_EXTRA_ALLOWED_TOOLS (space-separated) is added to both lists, less any connector write.
const extraTools = withoutConnectorWrites(CLAUDE_EXTRA_ALLOWED_TOOLS.split(/\s+/).filter(Boolean));
export const CLAUDE_ALLOWED_TOOLS = [...BASE_TOOLS, ...extraTools];
export const CLAUDE_MR_COMMENTS_ALLOWED_TOOLS = [...MR_COMMENTS_TOOLS, ...extraTools];

// The stages of the staged pipelines (lib/pipeline) get only what their job takes. The bot has
// already checked out the MR and fetched its target, so no stage fetches, nests a worktree or
// starts a sub-agent; the ticket tool is there for a ticket the bot could not read itself.
const STAGE_GIT = READ_GIT.filter((rule) => !/git (fetch|worktree)/.test(rule));
export const STAGE_READ_TOOLS = ['Read', 'Grep', 'Glob', ...STAGE_GIT, ...TICKET_READ_TOOLS, ...extraTools];
// Fixing a reviewer comment on my own MR, or settling a merge's conflicts: edit only. The bot
// commits what the stage changed, so each commit holds one stage's work under a known message.
export const STAGE_FIX_TOOLS = [...STAGE_READ_TOOLS, 'Edit', 'Write'];

// An Understand job reads the repo at its default branch and the connectors, and writes only its
// context file (the sandbox keeps writes in its worktree). It neither fetches nor nests worktrees.
export const UNDERSTAND_TOOLS = ['Read', 'Grep', 'Glob', 'Write', ...STAGE_GIT, ...CONNECTOR_READ_TOOLS, ...extraTools];
