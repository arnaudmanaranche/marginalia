import type { FixesStatus, Thread } from './api';

// The threads I answer on my own MR: opened by a reviewer (not me, not a bot) and still open.
export function reviewerThreads(threads: Thread[]): Thread[] {
  return threads.filter((t) => !t.resolved && t.notes.length > 0 && !t.notes[0].mine && !t.notes[0].bot);
}

// What a reply sends. A comment the triage fixed is only answered once the fix is on the MR, and
// the answer names the commit: null until then.
export function replyBody(text: string, fixed: boolean, fixes: FixesStatus | null): string | null {
  const answer = text.trim();
  if (!fixed) return answer;
  if (fixes?.state !== 'pushed' || !fixes.fixesSha) return null;
  return `${answer}\n\nFixed in ${fixes.fixesSha.slice(0, 8)}.`;
}
