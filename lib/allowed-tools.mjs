import { CLAUDE_EXTRA_ALLOWED_TOOLS } from './config.mjs';

// The tools each headless run may use, passed to `claude --allowedTools`.

// The /code-review command needs to orchestrate a nested worktree, spawn the
// code-reviewer agent, and read the ticket/MR from the GitLab and Atlassian
// connectors — it cannot run under the old read-only lockdown.
const BASE_TOOLS = [
  'Agent',
  'EnterWorktree',
  'ExitWorktree',
  'Read',
  'Grep',
  'Glob',
  'Write',
  'Bash(git:*)',
  'mcp__claude_ai_Gitlab__list_merge_requests',
  'mcp__claude_ai_Gitlab__get_merge_request',
  'mcp__claude_ai_Atlassian__getJiraIssue',
  'mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql',
];

// /mr-comments needs more than /code-review: it edits files directly instead
// of only reading/writing the report, and it calls preflight-access/humanizer
// (Skill) plus the self-hosted GitLab MCP server for discussion threads (the
// claude_ai_Gitlab connector doesn't expose those). The exact discussion-read
// tool name isn't documented anywhere in the command files — if a run fails
// on a missing tool, check the error for the tool name and add it here.
const MR_COMMENTS_TOOLS = [
  ...BASE_TOOLS,
  'Edit',
  'Skill',
  'mcp__GitLab__authenticate',
];

// CLAUDE_EXTRA_ALLOWED_TOOLS (space-separated) is added to both lists.
const extraTools = CLAUDE_EXTRA_ALLOWED_TOOLS.split(/\s+/).filter(Boolean);
export const CLAUDE_ALLOWED_TOOLS = [...BASE_TOOLS, ...extraTools];
export const CLAUDE_MR_COMMENTS_ALLOWED_TOOLS = [...MR_COMMENTS_TOOLS, ...extraTools];
