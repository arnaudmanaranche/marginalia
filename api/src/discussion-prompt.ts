// What a run is told about the MR's review conversation on GitLab. Pure: the caller fetches the threads.

const MAX_THREAD_CHARS = 6000;

// The threads as plain text, truncated. `me` names the bot's user in that role; `ids` names each
// thread by its GitLab discussion id, for a reply to point at.
function threadText(threads: any[], me: string, { ids = false } = {}) {
  const lines: string[] = [];
  for (const t of threads) {
    const where = t.path ? ` on ${t.path}${t.line ? `:${t.line}` : ''}` : '';
    lines.push(`- Thread${ids ? ` ${t.id}` : ''}${where}${t.resolved ? ' (resolved)' : ''}:`);
    for (const n of t.notes) lines.push(`  - ${n.mine ? me : n.author}: ${n.body.replace(/\s+/g, ' ').trim()}`);
  }
  const text = lines.join('\n');
  return text.length > MAX_THREAD_CHARS ? `${text.slice(0, MAX_THREAD_CHARS)}\n  [...truncated]` : text;
}

// What the re-run is told about the conversation so far, so it neither repeats a
// point the author already addressed nor ignores a reply. Skill-agnostic: it is
// plain text appended to the system prompt, whatever the review command is.
export function discussionPrompt(threads: any[]) {
  if (!threads.length) return '';
  return [
    'This merge request already has a review conversation on GitLab (below). The author may have pushed fixes in reply.',
    'Do not repeat a point that was addressed. If a reply claims a fix, check the code and say so only if it is not actually fixed or is only partly fixed. Mention anything a reply left open.',
    '',
    threadText(threads, 'me (the reviewer)'),
  ].join('\n');
}
