import { join } from 'node:path';

// What an Understand job is told: the method to follow and the contract of what it writes. Pure, so
// it is tested as text. The shape is checked strictly afterwards (AgentProjectContext).
export const CONTEXT_FILE = '.marginalia-context.json';

export const UNDERSTAND_SYSTEM = 'You are running headless, driven by marginalia, to learn a repository. You only read: never post, comment, reply or change anything anywhere, never edit repository files, never `git push`. Do not ask questions; nobody can answer. Take the safest default.';

/** @param {{ methodPath: string, worktreeDir: string, project: { key: string, gitlabProjectId: string, kind: string | null }, branch: string }} input */
export function understandPrompt({ methodPath, worktreeDir, project, branch }: { methodPath: string; worktreeDir: string; project: { key: string; gitlabProjectId: string; kind: string | null }; branch: string }) {
  return [
    `Learn the repository checked out in ${worktreeDir} (GitLab project ${project.gitlabProjectId}, default branch ${branch}${project.kind ? `, declared as a ${project.kind}-end` : ''}).`,
    `First read the method at ${methodPath} with the Read tool and follow it.`,
    `Then write the project context as JSON with the Write tool to this exact absolute path: ${join(worktreeDir, CONTEXT_FILE)}. Write it yourself, in the top-level session, never inside a subagent.`,
    'Shape (every list is a JSON array, even with one entry): {"summary": string, "glossary": [{"name": string, "summary": string, "codeNames"?: string[], "avoid"?: string[], "where"?: string[], "sources": Source[]}], "stack": [{"name": string, "summary": string, "where"?: string[], "sources": Source[]}], "features": [same as stack], "criticalPaths": [{"name": string, "summary": string, "rank": 1, "steps"?: string[], "where"?: string[], "tests"?: string[], "fragile"?: string[], "sources": Source[]}]}, where Source is {"kind": "file" | "ticket" | "page" | "thread" | "query" | "url", "ref": string}.',
    'Before writing, read the team\'s tools as the method says: the tracker (mcp__claude_ai_Atlassian_MCP__searchJiraIssuesUsingJql: recent bugs, the most discussed tickets), the docs (mcp__claude_ai_Notion__notion-search, then notion-fetch) and chat (mcp__claude_ai_Slack__slack_search_public). Cite what you use as ticket, page or thread sources. Skip a tool only when it is refused.',
    'Every section is non-empty, every item has at least one source, and critical path ranks are distinct. The file is checked strictly: anything else is rejected and nothing of it is kept.',
    'Run one plain command per Bash call (`git log -5 --oneline`, not `cd ... &&` or `$VARIABLE`). Your final message is one line saying how many items each section has.',
  ].join('\n\n');
}
