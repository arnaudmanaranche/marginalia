import { log } from './log.ts';
import { logger } from './logger.ts';
import { reviewHold } from './review-hold.ts';
import { askedFor } from './poll-pass-mr.ts';

// Whether a pass leaves the automatic review of `mr` waiting (GLOSSARY: Hold, review-hold.ts):
// says why on its entry and returns true. Not recorded in the state, so a new push takes it again.
// Facts that cannot be read hold nothing back, like a budget that cannot be read. The MR a person
// asked for never waits. `deps.reviewFacts(mr)` and `deps.staleAfterDays()` are optional.
export async function heldBack(kind: 'review' | 'own', mr: any, { deps, sink, asked }: any) {
  if (!deps.reviewFacts || askedFor(asked, kind, mr)) return false;
  let facts;
  try {
    facts = await deps.reviewFacts(mr);
  } catch (err) {
    logger.warn({ err, project: mr.project?.key, iid: mr.iid }, 'Could not read the last push and approvals');
    return false;
  }
  const reason = reviewHold({ kind, author: mr.author.username, facts, staleDays: deps.staleAfterDays(), now: Date.now() });
  if (!reason) return false;
  log(mr, `Not reviewed by this poll: ${reason}`);
  await sink.setMr(mr, { status: 'skipped', error: reason }, kind);
  return true;
}
