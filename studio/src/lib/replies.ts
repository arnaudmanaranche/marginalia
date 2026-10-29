import type { FixesStatus, Thread } from './api';

// The threads I answer on my own MR: opened by a reviewer (not me, not a bot) and still open.
export function reviewerThreads(threads: Thread[]): Thread[] {
  return threads.filter((t) => !t.resolved && t.notes.length > 0 && !t.notes[0].mine && !t.notes[0].bot);
}

// The commit that fixed a thread once it is on the MR: found by its thread trailer (a fix pushed
// alone changes sha), else, for a triage without trailers, the thread's commit or the fixes' head
// once all of them are pushed. Null until pushed.
export function landedFix(threadId: string, fixes: FixesStatus | null, commit?: string | null): string | null {
  const landed = fixes?.landed?.find((l) => l.thread === threadId);
  if (landed) return landed.sha;
  if (fixes?.state !== 'pushed' || !fixes.fixesSha) return null;
  return commit ?? fixes.fixesSha;
}

// The fix waiting to be pushed for a thread, when the triage made one for it.
export function pendingFix(threadId: string, fixes: FixesStatus | null) {
  if (fixes?.state !== 'ready') return null;
  return fixes.commits.find((c) => c.thread === threadId) ?? null;
}

// What a reply sends. A comment the triage fixed is only answered once the fix is on the MR, and
// the answer names the commit. Null until pushed.
export function replyBody(text: string, fixed: boolean, landed: string | null): string | null {
  const answer = text.trim();
  if (!fixed) return answer;
  if (!landed) return null;
  return `${answer}\n\nFixed in ${landed.slice(0, 8)}.`;
}

// The order I answer them in on my own MR: file by file, down each file, general comments last.
export function byPlace(threads: Thread[]): Thread[] {
  return [...threads].sort((a, b) => (a.path === null ? 1 : 0) - (b.path === null ? 1 : 0) || (a.path ?? '').localeCompare(b.path ?? '') || (a.line ?? 0) - (b.line ?? 0));
}
