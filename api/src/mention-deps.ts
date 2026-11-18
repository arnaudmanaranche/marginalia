import { GITLAB_USERNAME, MENTION_DAILY_CAP } from './config.ts';
import { failureKind } from './failure-kind.ts';
import { gitlab } from './gitlab-api.ts';
import { listOpenMergeRequests } from './gitlab.ts';
import { mentionRunsSince, markMention, readCursor, seenMentionIds, writeCursor } from './mention-store.ts';
import { answerMention } from './mention-answer.ts';
import { runMrComments, runReview } from './claude-runner.ts';
import { recordReviewedHead } from './state.ts';
import { getDb } from './store.ts';

// The real collaborators of intakePass() (mention-pass.ts).
const DEFAULT_DAILY_CAP = 20;
const failureTitleOf = (err: unknown) => failureKind((err as Error)?.message).title.toLowerCase();

// A review a mention asked for records its head like a poll's review would.
async function reviewAndRecord(mr: any) {
  const outcome = await runReview(mr);
  if (outcome === 'reviewed' && mr.sha) await recordReviewedHead(mr.project, mr.iid, mr.sha);
  return outcome;
}

export const mentionDeps = {
  bot: GITLAB_USERNAME,
  dailyCap: Number(MENTION_DAILY_CAP) || DEFAULT_DAILY_CAP,
  failureTitle: failureTitleOf,
  now: () => new Date(),
  openMergeRequests: listOpenMergeRequests,
  listRawDiscussions: gitlab.listRawDiscussions,
  memberAccessLevel: gitlab.memberAccessLevel,
  replyToDiscussion: gitlab.replyToDiscussion,
  run: { review: reviewAndRecord, triage: runMrComments, answer: answerMention },
  store: {
    seen: (project: string) => seenMentionIds(getDb(), project),
    mark: (project: string, rec: any) => markMention(getDb(), project, rec),
    runsSince: (iso: string) => mentionRunsSince(getDb(), iso),
    cursor: (project: string) => readCursor(getDb(), project),
    setCursor: (project: string, iso: string) => writeCursor(getDb(), project, iso),
  },
};
