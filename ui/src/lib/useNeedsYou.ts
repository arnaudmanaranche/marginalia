import type { ReviewItem } from './api';
import { useApprovals } from './approvalsApi';
import { useContexts, waitsForApproval } from './contextApi';
import { failuresNeedingYou, reviewsNeedingYou } from './feed';
import { useJobs } from './useJobs';

// What waits on a person, the one definition Home's headline and the Home tab both count: the reviews
// whose turn is theirs, the jobs that failed for good, the context drafts, and the proposed comments
// (one line, however many).
export function useNeedsYou(items: ReviewItem[]) {
  const { jobs, known: jobsKnown } = useJobs();
  const approvals = useApprovals();
  const proposals = approvals.data?.proposals.length ?? 0;
  const contexts = useContexts();
  const drafts = contexts.contexts.filter(waitsForApproval);
  // Whether every source has answered (or failed): until then the count is not said, rather than said low.
  const known = jobsKnown && approvals.known && contexts.known;
  const reviews = reviewsNeedingYou(items);
  // A review whose first run failed is already listed (and says it failed): one line, counted once.
  const listed = new Set(reviews.map((r) => r.item.slug));
  const failures = jobs ? failuresNeedingYou(jobs).filter((j) => !listed.has(j.slug)) : [];
  const count = reviews.length + failures.length + drafts.length + (proposals > 0 ? 1 : 0);
  return { jobs, proposals, drafts, reviews, failures, count, known };
}
