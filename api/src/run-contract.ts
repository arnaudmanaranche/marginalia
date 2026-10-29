import { join } from 'node:path';
import { FINDINGS_FILE } from './findings.ts';
import { REPORT_FILE } from './report.ts';

// What a headless run is told it must deliver, and where (see report.ts for reading it back).
export function contractPrompt(kind, extra = '', worktreeDir = '.') {
  const lines = [
    'You are running headless, driven by marginalia. Rules for this run:',
    '- Never post, reply, or resolve anything on GitLab, and never `git push`.',
    `- Deliver your final report as markdown by writing it with the Write tool to this exact absolute path: ${join(worktreeDir, REPORT_FILE)} (NOT under .claude/). Do this yourself, in the top-level session, never inside a subagent: subagent output only reaches you as a tool result, so collect it and write the complete report yourself.`,
    '- If you entered a worktree (EnterWorktree), first exit it, then write the report: files written while inside it are discarded with it. If the Write is refused, print the report as your entire final message inside a block: <<<REVIEW_FILE path="report.md">>> ...report... <<<END_REVIEW_FILE>>>.',
    '- Your final message must be the report itself or the block, never a summary of it.',
    '- Do not ask the user questions; nobody can answer. Take the safest default.',
    '- MR_REVIEW_BOT is set to 1 for this run: do not read it from the shell. The shell already starts in the worktree. Run one plain command per Bash call (`git branch --show-current`, not `cd ... &&`, `git -C ...` or `$VARIABLE`): anything else is refused by the permission check.',
    `- Also write the same findings as JSON with the Write tool to ${join(worktreeDir, FINDINGS_FILE)}, so the studio can count them and offer each comment for posting whatever your report looks like. Shape: {"verdict": "APPROVE" | "REQUEST_CHANGES", "summary": "one or two sentences", "risk": {"level": "low" | "medium" | "high", "rationale": "why, in one sentence", "factors": ["blast radius, missing tests, auth/data/migration touched..."]}, "overview": {"before": "what the code did before this MR, in plain words", "after": "what it does now, in plain words"}, "tour": [{"title": "the one idea of this chapter, in plain words", "summary": "what changed and why, in plain words, then what to check", "files": ["repo/relative/file.ts"], "findings": ["ids of findings to attach"], "threads": ["ids of the MR's discussion threads this chapter is about"]}], "findings": [{"id": "optional stable id", "severity": "critical" | "important" | "suggestion" | "info", "title": "short title", "path": "repo/relative/file.ts", "line": 42, "body": "what is wrong and why", "comment": "the comment to post on the MR, ready as is"}]}. For a review, overview and tour are required: they are what lets a reader grasp the MR without opening every file, and every report reads the same way through them. risk is optional. Order the tour chapters by what matters: the core change first, then what supports it, and database, tests and generated files last, and give a finding an id when a stop must reference it; path, line, id and comment are optional; use "path" without "line" to comment on a whole file. Keep the markdown report as the human-readable version.`,
  ];
  if (kind === 'triage') {
    lines.push('- If you fix code, commit the changes locally with `git add -A && git commit` (never push) before finishing.');
    lines.push('- This is my own merge request: I answer the reviewers, I do not review it. In the findings JSON, add "replies": one entry per unresolved thread, {"thread": "<the thread id given with it>", "verdict": "fixed" | "already_fixed" | "not_relevant" | "wrong" | "answered", "reply": "my answer to the reviewer, first person, as I would type it on GitLab", "resolve": true | false}. "fixed" means you fixed it in this run: say what changed, without a commit id (the studio adds it once the fix is pushed). Set "resolve" to true only when the thread is settled by a fix; leave a disagreement open for the reviewer. Overview, tour and findings are not needed here: the studio lists the threads with their replies.');
    lines.push('- Write everything in English: the report, every drafted reply, the findings JSON and the commit messages. This holds whatever language the command, the reviewer comments, the ticket or this session use; do not translate the quoted comments themselves.');
  }
  if (extra.trim()) lines.push(extra.trim());
  return lines.join('\n');
}
