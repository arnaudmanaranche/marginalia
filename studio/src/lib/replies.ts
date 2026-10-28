import type { FixesStatus, Thread } from './api';

// The threads I answer on my own MR: opened by a reviewer (not me, not a bot) and still open.
export function reviewerThreads(threads: Thread[]): Thread[] {
  return threads.filter((t) => !t.resolved && t.notes.length > 0 && !t.notes[0].mine && !t.notes[0].bot);
}

// What a reply sends. A comment the triage fixed is only answered once the fix is on the MR, and
// the answer names the commit: the thread's own when the triage made one per thread, else the
// fixes' head. Null until pushed.
export function replyBody(text: string, fixed: boolean, fixes: FixesStatus | null, commit?: string | null): string | null {
  const answer = text.trim();
  if (!fixed) return answer;
  if (fixes?.state !== 'pushed' || !fixes.fixesSha) return null;
  return `${answer}\n\nFixed in ${(commit ?? fixes.fixesSha).slice(0, 8)}.`;
}

// The order I answer them in on my own MR: file by file, down each file, general comments last.
export function byPlace(threads: Thread[]): Thread[] {
  return [...threads].sort((a, b) => (a.path === null ? 1 : 0) - (b.path === null ? 1 : 0) || (a.path ?? '').localeCompare(b.path ?? '') || (a.line ?? 0) - (b.line ?? 0));
}
