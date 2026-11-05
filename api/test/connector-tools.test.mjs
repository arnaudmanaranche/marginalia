import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTOR_READ_TOOLS, TICKET_READ_TOOLS, isConnectorWrite, withoutConnectorWrites } from '../dist/src/connector-tools.js';
import { CLAUDE_ALLOWED_TOOLS, CLAUDE_MR_COMMENTS_ALLOWED_TOOLS, STAGE_FIX_TOOLS, STAGE_READ_TOOLS } from '../dist/src/allowed-tools.js';
import { connectorChecks } from '../dist/src/connector-checks.js';

test('every connector tool a run gets only reads', () => {
  for (const list of [CLAUDE_ALLOWED_TOOLS, CLAUDE_MR_COMMENTS_ALLOWED_TOOLS, STAGE_READ_TOOLS, STAGE_FIX_TOOLS]) {
    assert.deepEqual(list.filter(isConnectorWrite), []);
  }
  assert.deepEqual(CONNECTOR_READ_TOOLS.filter(isConnectorWrite), []);
});

test('the reviews read Jira through the v2 Atlassian connector, plus Notion and Slack', () => {
  for (const tool of ['mcp__claude_ai_Atlassian_MCP__getJiraIssue', 'mcp__claude_ai_Notion__notion-fetch', 'mcp__claude_ai_Slack__slack_read_thread']) {
    assert.ok(CLAUDE_ALLOWED_TOOLS.includes(tool), tool);
  }
  assert.ok(TICKET_READ_TOOLS.every((tool) => STAGE_READ_TOOLS.includes(tool)));
});

test('a write tool is recognised by its name, and dropped from an extra list', () => {
  for (const tool of ['mcp__claude_ai_Gitlab__create_merge_request', 'mcp__claude_ai_Slack__slack_send_message', 'mcp__claude_ai_Atlassian_MCP__executeWrite', 'mcp__claude_ai_Atlassian_MCP__addOrEditJiraIssueComment', 'mcp__claude_ai_Notion__notion-update-page', 'mcp__claude_ai_PostHog__exec']) {
    assert.ok(isConnectorWrite(tool), tool);
  }
  assert.ok(!isConnectorWrite('mcp__claude_ai_Atlassian_MCP__executeRead'));
  assert.ok(!isConnectorWrite('Bash(npm test:*)'));
  assert.deepEqual(withoutConnectorWrites(['Bash(npm test:*)', 'mcp__claude_ai_Gitlab__create_branch']), ['Bash(npm test:*)']);
});

const LIST = `Checking MCP server health…

claude.ai Atlassian MCP: https://mcp.atlassian.com/v2/mcp - ✔ Connected
claude.ai Slack: https://mcp.slack.com/mcp - ✔ Connected
claude.ai Notion: https://mcp.notion.com/mcp - ! Needs authentication
claude.ai Gitlab: https://gitlab.example.com/mcp - ✘ Failed to connect — HTTP 404
`;

test('connectors: connected is ok, anything else warns and never blocks', () => {
  const checks = Object.fromEntries(connectorChecks({ stdout: LIST }).map((c) => [c.label, c]));
  assert.equal(checks['Jira connector'].level, 'ok');
  assert.equal(checks['Slack connector'].level, 'ok');
  assert.match(checks['Notion connector'].detail, /needs a login/);
  assert.match(checks['GitLab connector'].detail, /does not answer/);
  assert.match(connectorChecks({ stdout: '' })[0].detail, /not set up/);
  const failed = connectorChecks({ error: 'spawn claude ENOENT' });
  assert.equal(failed.length, 1);
  assert.equal(failed[0].level, 'warn');
  assert.ok(connectorChecks({ stdout: LIST }).every((c) => c.level !== 'block'));
});
