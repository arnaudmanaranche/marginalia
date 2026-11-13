import { log } from './log.ts';
import { logger } from './logger.ts';
import { reviewHold, type ReviewFacts } from './review-hold.ts';
import { askedFor } from './poll-pass-mr.ts';

// Whether a pass leaves the automatic review of `mr` waiting (GLOSSARY: Hold, review-hold.ts):
// says why on its entry and returns true. Not recorded in the state, so a new push takes it again.
// Facts that cannot be read hold nothing back, like a budget that cannot be read. The MR a person
// asked for never waits. `deps.reviewFacts(mr)` and `deps.staleAfterDays()` are optional: without the
// facts nothing waits, without a stale limit only an approval does.
// `mr` and `asked` stay `any`: the MR is GitLab's payload, typed with the other shared shapes (api.md).
interface HoldPass {
  deps: { reviewFacts?: (mr: any) => Promise<ReviewFacts>; staleAfterDays?: () => number };
  sink: { setMr: (mr: any, patch: Record<string, unknown>, entry: string) => Promise<unknown> };
  asked: any;
}

export async function heldBack(kind: 'review' | 'own', mr: any, { deps, sink, asked }: HoldPass) {
  if (!deps.reviewFacts || askedFor(asked, kind, mr)) return false;
  let facts;
  try {
    facts = await deps.reviewFacts(mr);
  } catch (err) {
    logger.warn({ err, project: mr.project?.key, iid: mr.iid }, 'Could not read the last push and approvals');
    return false;
  }
  const reason = reviewHold({ kind, author: mr.author.username, facts, staleDays: deps.staleAfterDays?.() ?? Infinity, now: Date.now() });
  if (!reason) return false;
  log(mr, `Not reviewed by this poll: ${reason}`);
  await sink.setMr(mr, { status: 'skipped', error: reason }, kind);
  return true;
}
