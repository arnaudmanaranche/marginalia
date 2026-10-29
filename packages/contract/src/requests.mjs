// @ts-check
import { z } from '@hono/zod-openapi';
import { DiscussionId, ReviewId } from './common.mjs';

export const PushRequest = z.object({
  slug: ReviewId,
  sha: z.string().regex(/^[0-9a-f]{40}$/).optional().describe('Push only this fix (one of `commits`); without it, every fix.'),
}).meta({ id: 'PushRequest' });

export const AddToReviewRequest = z.object({
  slug: ReviewId,
  commentId: z.string().regex(/^[\w-]{1,64}$/).describe('Stable id of the "Comment to post" block within the review.'),
  body: z.string().trim().min(1).max(10_000),
  path: z.string().min(1).max(500).refine((p) => !p.includes('\0'), 'bad path').optional().describe('File of the diff. With `line` for an inline comment, alone for a whole-file comment.'),
  line: z.number().int().min(1).optional().describe('Line of the new version of the file. Requires `path`.'),
}).refine((b) => b.line === undefined || b.path !== undefined, { message: 'line needs a path', path: ['line'] }).meta({ id: 'AddToReviewRequest' });

export const SubmitRequest = z.object({
  slug: ReviewId,
  summary: z.string().max(10_000).optional(),
  action: z.enum(['comment', 'approve', 'request_changes']).default('comment'),
}).meta({ id: 'SubmitRequest' });
export const Submitted = z.object({ submitted: z.number().int(), summary: z.boolean(), action: z.enum(['comment', 'approve', 'request_changes']) }).meta({ id: 'Submitted' });

export const ReplyRequest = z.object({
  slug: ReviewId,
  threadId: DiscussionId,
  body: z.string().trim().min(1).max(10_000),
  resolve: z.boolean().default(false).describe('Resolve the thread when the replies are submitted.'),
}).meta({ id: 'ReplyRequest' });

export const DraftEdit = z.object({ body: z.string().trim().min(1).max(10_000) }).meta({ id: 'DraftEdit' });
export const SlugBody = z.object({ slug: ReviewId }).meta({ id: 'SlugBody' });
export const ChatRequest = z.object({
  slug: ReviewId, stopId: z.string(), question: z.string(),
  history: z.array(z.unknown()).optional().describe('Earlier turns, `{ role: user|assistant, text }`; malformed ones are dropped, the last 6 kept.'),
}).meta({ id: 'ChatRequest' });
export const ChatAnswer = z.object({ answer: z.string() }).meta({ id: 'ChatAnswer' });
export const Rerun = z.object({ ok: z.literal(true), iid: z.number().int(), kind: z.enum(['review', 'comments']) }).meta({ id: 'Rerun' });
