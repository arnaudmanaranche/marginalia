// The tools a run may call on the claude.ai connectors of the logged-in account. Read-only, always:
// the agent never writes to GitLab, Jira, Notion or Slack (ADR 0006); only `api/` writes, after
// an approval or a mention. Pure, so the lists are tested as they are.

const tools = (server: string, names: string[]) => names.map((name) => `mcp__claude_ai_${server}__${name}`);

// The claude.ai connector each source is read through, as `claude mcp list` names it.
export const CONNECTORS = [
  { source: 'GitLab', name: 'claude.ai Gitlab' },
  { source: 'Jira', name: 'claude.ai Atlassian MCP' },
  { source: 'Notion', name: 'claude.ai Notion' },
  { source: 'Slack', name: 'claude.ai Slack' },
];

const GITLAB = tools('Gitlab', [
  'who_am_i', 'get_project', 'list_merge_requests', 'get_merge_request', 'get_file_contents',
  'list_commits', 'get_commit', 'get_commit_diff', 'get_branch_diffs', 'list_issues', 'get_issue',
  'list_pipelines', 'get_pipeline', 'list_pipeline_jobs',
]);

// Atlassian's v2 connector. `executeRead` only runs operations Atlassian classes as reads.
const JIRA = tools('Atlassian_MCP', [
  'atlassianUserInfo', 'getAccessibleAtlassianResources', 'getJiraIssue', 'searchJiraIssuesUsingJql',
  'listJiraIssueComments', 'search', 'searchConfluence', 'getConfluenceContent', 'discover', 'executeRead',
]);

// The v1 connector, still listed for accounts not yet moved to v2; Atlassian is retiring it.
const JIRA_V1 = tools('Atlassian', ['atlassianUserInfo', 'getVisibleJiraProjects', 'getJiraIssue', 'searchJiraIssuesUsingJql']);

const NOTION = tools('Notion', [
  'notion-search', 'notion-fetch', 'notion-get-comments', 'notion-get-users', 'notion-get-teams',
  'notion-list-page-backlinks', 'notion-query-data-sources', 'notion-query-multiple-data-sources',
]);

const SLACK = tools('Slack', [
  'slack_search_public', 'slack_search_channels', 'slack_search_users', 'slack_read_channel',
  'slack_read_thread', 'slack_read_canvas', 'slack_read_file', 'slack_read_user_profile', 'slack_get_reactions',
]);

// PostHog has none: its connector is one `exec` tool that writes as well as reads, so the agent
// gets PostHog data from the bot instead.
export const CONNECTOR_READ_TOOLS = [...GITLAB, ...JIRA, ...JIRA_V1, ...NOTION, ...SLACK];

// The ticket alone, for the staged pipelines' read-only stages.
export const TICKET_READ_TOOLS = [`mcp__claude_ai_Atlassian_MCP__getJiraIssue`, `mcp__claude_ai_Atlassian__getJiraIssue`];

// A connector tool whose name says it changes something. Matched on the words after the server
// name, so `executeRead` and `notion-fetch` stay readable while `executeWrite` does not.
const WRITE_WORD = /(create|update|edit|delete|remove|send|post|add|transition|cancel|retry|schedule|share|trash|move|restore|upload|set|resolve|spawn|stop|duplicate|convert|complete|execute(?!Read)|exec$|write|destructive)/i;
export function isConnectorWrite(tool: string) {
  const [prefix, server, name] = tool.split('__');
  return prefix === 'mcp' && server?.startsWith('claude_ai_') === true && WRITE_WORD.test(name ?? '');
}

// Drops connector write tools from a list (e.g. CLAUDE_EXTRA_ALLOWED_TOOLS): a config cannot hand
// the agent a write.
export const withoutConnectorWrites = (list: string[]) => list.filter((tool) => !isConnectorWrite(tool));
