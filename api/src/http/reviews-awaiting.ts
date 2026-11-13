import { reviewId } from '../review-id.ts';
import { newerState, stateOverrides } from './context.ts';
import { kindOf } from './review-kind.ts';

// Why a poll left this MR's review for later, other than the budget (which keeps its own mark): its reason.
export const holdOf = (mr: any): string | null => (mr?.status === 'skipped' && mr.held !== 'budget' ? mr.error ?? null : null);

// The bot statuses of an MR it is about to review, or failed to, before any report exists.
export const AWAITING = new Set(['pending', 'reviewing', 'failed', 'skipped']);

// An MR the poll just picked up has no report yet: it is listed at once, `awaiting` its first one,
// so it arrives in the queue when the bot finds it rather than minutes later.
export function awaitingItem(project: any, mr: any) {
  const fileSlug = mr.reviewPath.split('/').pop().replace(/\.md$/, '');
  const at = mr.updatedAt ?? new Date().toISOString();
  return {
    slug: reviewId(project, fileSlug),
    project: project.key,
    kind: mr.kind ?? kindOf(fileSlug),
    title: mr.title ?? fileSlug,
    iid: mr.iid,
    author: mr.author ?? null,
    webUrl: mr.web_url ?? null,
    branch: mr.sourceBranch ?? null,
    verdict: null, risk: null, critical: 0, important: 0, summary: null, highlights: [], postable: 0,
    contract: { source: 'none', warnings: [] },
    stackId: mr.stack?.id ? `${project.key}/${mr.stack.id}` : null,
    crossLayer: [],
    stale: false,
    mtime: at,
    reviewedAt: at,
    tracked: true,
    jira: mr.jira ?? null,
    myState: newerState(mr.myState ?? null, stateOverrides.get(`${project.key}:${mr.iid}`) ?? null),
    // Reviewing shows from the bot's live status; here, whether the first review is still to come, or
    // why this poll does not run it (a hold); the budget's wait shows from the status it keeps.
    awaiting: mr.status === 'failed' ? 'failed' : holdOf(mr) ? 'held' : 'queued',
    hold: holdOf(mr),
    failure: mr.status === 'failed' ? mr.failure ?? null : null,
  };
}
