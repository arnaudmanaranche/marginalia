import { z } from '@hono/zod-openapi';
import { DiscussionId, ReviewId, ReviewKind, ShapeSource, Verdict, nullable } from './common.ts';

export const Finding = z.object({
  id: z.string().regex(/^[\w-]{1,64}$/).describe('Stable across re-runs. Also the `commentId` when posted.'),
  severity: z.enum(['critical', 'important', 'suggestion', 'info']),
  title: z.string(),
  path: nullable(z.string()).describe('Repo-relative file the finding is about.'),
  line: nullable(z.number().int().min(1)).describe('Only set together with `path`.'),
  body: z.string(),
  comment: nullable(z.string()).describe('The comment to post on the merge request, ready as is.'),
}).meta({ id: 'Finding' });

export const Reply = z.object({
  thread: DiscussionId,
  verdict: z.enum(['fixed', 'already_fixed', 'not_relevant', 'wrong', 'answered']).describe('`fixed`: fixed by this triage, sent once the fix is pushed.'),
  reply: z.string().describe('The drafted answer to the reviewer, first person.'),
  resolve: z.boolean().describe('Whether sending it also resolves the thread.'),
  commit: z.string().optional().describe('The commit that fixed this thread (staged triage): the reply names it once pushed.'),
}).meta({ id: 'Reply' });

export const ReviewShape = z.object({
  version: z.literal(1),
  source: ShapeSource,
  verdict: Verdict,
  summary: nullable(z.string()),
  risk: z.object({ level: z.enum(['low', 'medium', 'high']) }).passthrough().nullable().optional(),
  overview: z.object({ before: z.string(), after: z.string() }).nullable().optional(),
  tour: z.array(z.object({ id: z.string(), title: z.string(), summary: z.string(), files: z.array(z.string()) }).passthrough()).optional(),
  findings: z.array(Finding),
  replies: z.array(Reply).optional().describe('A triage of my own MR: the drafted reply to each reviewer thread.'),
  warnings: z.array(z.string()),
  generatedAt: z.string().optional(),
}).describe('What the studio relies on, the same whatever skill or command wrote the review.').meta({ id: 'ReviewShape' });

export const ReviewContent = z.object({ slug: ReviewId, kind: ReviewKind, markdown: z.string(), shape: ReviewShape }).meta({ id: 'ReviewContent' });
export const Versions = z.object({ versions: z.array(z.object({ id: z.string(), at: z.string() })) }).meta({ id: 'Versions' });
export const Version = z.object({ slug: ReviewId, id: z.string(), markdown: z.string(), shape: ReviewShape }).meta({ id: 'Version' });
