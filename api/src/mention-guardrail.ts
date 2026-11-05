import type { Mention } from './mention.ts';

// The guardrails a mention passes before anything runs (PRODUCT.md, ADR 0004), in the order they
// are applied. Pure: what the bot remembers and what GitLab says arrive as arguments.
export const DEVELOPER = 30; // GitLab's access level for Developer
export type Decision = { action: 'run' } | { action: 'queue' } | { action: 'ignore'; reason: 'duplicate' | 'not-a-member' | 'daily-cap' };

export interface Standing {
  seenNoteIds: ReadonlySet<number>;
  /** The author's access level in the project, 0 when they are no member. */
  accessLevel: number;
  runsToday: number;
  dailyCap: number;
  /** A run for this MR is going now. */
  busy: boolean;
}

// Bot notes never reach here (findMentions drops them). A note id seen once never runs again, so a
// note that arrives by webhook and by polling runs once; a refused mention is remembered too.
export function decideMention(mention: Mention, s: Standing): Decision {
  if (s.seenNoteIds.has(mention.noteId)) return { action: 'ignore', reason: 'duplicate' };
  if (s.accessLevel < DEVELOPER) return { action: 'ignore', reason: 'not-a-member' };
  if (s.runsToday >= s.dailyCap) return { action: 'ignore', reason: 'daily-cap' };
  return { action: s.busy ? 'queue' : 'run' };
}

// Mentions that queued behind a run become one follow-up: the questions in order, one review at most.
export function mergeQueued(queued: Mention[]): Mention[] {
  const wantsReview = queued.some((m) => m.invocation.kind === 'review');
  const rest = queued.filter((m) => m.invocation.kind !== 'review');
  const first = queued.find((m) => m.invocation.kind === 'review');
  return [...(wantsReview && first ? [first] : []), ...rest];
}
