// @ts-check
import { z } from '@hono/zod-openapi';
import { ReviewId, ReviewKind, ShapeSource, Verdict, nullable } from './common.mjs';

const Highlight = z.object({ severity: z.enum(['critical', 'important']), text: z.string() }).meta({ id: 'Highlight' });
const CrossFinding = z.object({ kind: z.enum(['settled-later', 'belongs-lower', 'assumes-upper']), iid: z.number().int(), text: z.string() }).meta({ id: 'CrossFinding' });
const JiraRef = nullable(z.object({ key: z.string(), priority: nullable(z.string()), rank: nullable(z.number().int()) }));
const MyState = nullable(z.object({ computedAt: z.string() }).passthrough()).describe('Where the MR stands for you, read from GitLab.');

export const Failure = z.object({ kind: z.string(), transient: z.boolean().describe('Passes by itself: retried soon, no alarm.'), title: z.string(), advice: z.string() }).describe('Why a run failed, sorted (api/src/failure-kind.mjs).').meta({ id: 'Failure' });

export const ReviewItem = z.object({
  slug: ReviewId,
  project: z.string(),
  kind: ReviewKind,
  title: z.string(),
  iid: z.union([z.string(), z.number().int(), z.null()]).describe('Merge request number.'),
  author: nullable(z.string()),
  webUrl: nullable(z.string()),
  branch: nullable(z.string()),
  verdict: Verdict,
  risk: nullable(z.enum(['low', 'medium', 'high'])),
  critical: z.number().int().min(0),
  important: z.number().int().min(0),
  summary: nullable(z.string()),
  highlights: z.array(Highlight),
  postable: z.number().int().min(0).describe('Findings that come with a comment ready to post.'),
  contract: z.object({ source: ShapeSource, warnings: z.array(z.string()) }),
  stackId: nullable(z.string()),
  crossLayer: z.array(CrossFinding),
  stale: z.boolean().describe('Reviewed before, but the commit (or the layer below) moved since.'),
  mtime: z.string(),
  reviewedAt: z.string(),
  tracked: z.boolean().describe('A merge request in `status.json` points at this review. Posting needs it.'),
  jira: JiraRef,
  myState: MyState.optional(),
  failure: nullable(Failure).optional().describe('Why the last run failed, while the MR is marked failed.'),
  awaiting: z.enum(['queued', 'failed']).optional().describe('The bot picked the MR up and has no report for it yet: its first review is to come (or running), or it failed.'),
}).meta({ id: 'ReviewItem' });

const StackLayer = z.object({
  iid: z.number().int(), title: z.string(), webUrl: nullable(z.string()), slug: nullable(z.string()),
  status: z.string(), parentIid: nullable(z.number().int()), position: z.number().int(),
}).meta({ id: 'StackLayer' });
export const Stack = z.object({ id: z.string(), baseBranch: z.string(), layers: z.array(StackLayer) }).meta({ id: 'Stack' });
