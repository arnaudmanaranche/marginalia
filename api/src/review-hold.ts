// Why a poll's automatic review of an MR waits (GLOSSARY: Hold), or null when it runs. Pure: the
// inputs are GitLab's answers, so it is tested on plain fixtures.
//
// - No push for `staleDays`: the code has not moved in that long, whatever was said on the MR
//   since (a comment or an approval moves GitLab's `updated_at`, not the code). This is also how
//   far back the bot catches up after it was stopped.
// - Someone other than the author approved the MR since its last push: a person already
//   reviewed that code. An own review is the author's, so only a review of someone else's MR waits.
// What a person asks for (Review again, a mention) never waits: the caller does not ask.

export interface ReviewFacts {
  lastPushAt: number | null;
  approvedBy: { username: string | null; at: string | null }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function reviewHold({ kind, author, facts, staleDays, now }: { kind: 'review' | 'own'; author: string; facts: ReviewFacts; staleDays: number; now: number }): string | null {
  const { lastPushAt, approvedBy } = facts;
  if (lastPushAt !== null && lastPushAt < now - staleDays * DAY_MS) {
    return `No push in the last ${staleDays} days (last on ${day(lastPushAt)}). Review again to run it.`;
  }
  if (kind !== 'review') return null;
  // An approval without a time is counted: GitLab resets approvals on a push where the project asks it.
  const since = approvedBy.filter((a) => a.username && a.username !== author && (lastPushAt === null || a.at === null || Date.parse(a.at) >= lastPushAt));
  if (!since.length) return null;
  return `Approved on GitLab by ${since.map((a) => a.username).join(', ')} since its last push: a person already reviewed it. Review again to run it.`;
}
