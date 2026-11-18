// The short name of the tool an agent step called, as the studio shows it on a chip: `read`, `git`,
// `jira.search`, `notion.fetch`. Pure. Only the tool and, for a shell call, the program it ran;
// never its arguments, which can carry paths or text from the reviewed repo.

// The claude.ai connector servers, by the source a person knows them as.
const SERVERS: Record<string, string> = {
  claude_ai_Gitlab: 'gitlab',
  claude_ai_Atlassian_MCP: 'jira',
  claude_ai_Atlassian: 'jira',
  claude_ai_Notion: 'notion',
  claude_ai_Slack: 'slack',
  claude_ai_PostHog: 'posthog',
};

// `notion-search` -> `search`, `slack_read_thread` -> `read_thread`, `searchJiraIssuesUsingJql` stays.
const shortTool = (server: string, name: string) => name.replace(new RegExp(`^${server}[-_]`, 'i'), '');

// The server and the tool of an MCP tool name (`mcp__<server>__<tool>`), or null for any other name.
export function parseMcpName(name: string) {
  const match = /^mcp__(.+?)__(.+)$/.exec(name);
  return match ? { server: match[1], tool: match[2] } : null;
}

export function toolOf(block: any): string | null {
  if (block?.type !== 'tool_use' || typeof block.name !== 'string') return null;
  const mcp = parseMcpName(block.name);
  if (mcp) {
    const source = SERVERS[mcp.server] ?? mcp.server.replace(/^claude_ai_/, '').toLowerCase();
    return `${source}.${shortTool(source, mcp.tool)}`;
  }
  if (block.name === 'Bash') {
    const program = String(block.input?.command ?? '').trim().split(/\s+/)[0]?.split('/').pop() ?? '';
    return /^[\w.-]{1,24}$/.test(program) ? program : 'bash';
  }
  if (block.name === 'Skill') return 'skill';
  if (block.name === 'Agent' || block.name === 'Task') return 'agent';
  return block.name.toLowerCase();
}
