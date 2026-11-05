import { z } from '@hono/zod-openapi';
import { ReviewId, nullable } from './common.ts';

// The approvals inbox (ADR 0006): what the factory proposes to write, waiting for a person.
export const Proposal = z.object({
  slug: ReviewId, project: z.string(), iid: z.number().int(), mrTitle: z.string(), webUrl: nullable(z.string()),
  reviewedAt: nullable(z.string()),
  findingId: z.string(), severity: z.enum(['critical', 'important', 'suggestion', 'info']), title: z.string(),
  path: nullable(z.string()), line: nullable(z.number().int()),
  comment: z.string().describe('The comment the review proposes, ready as is.'),
  criticalPaths: z.array(z.string()),
}).meta({ id: 'Proposal' });

export const Approvals = z.object({
  proposals: z.array(Proposal),
  canPost: z.boolean().describe('Whether this person may add comments to GitLab from here.'),
}).meta({ id: 'Approvals' });

export const DismissRequest = z.object({
  slug: ReviewId,
  commentId: z.string().regex(/^[\w-]{1,64}$/),
  undo: z.boolean().optional().describe('Bring a dismissed finding back to the inbox.'),
}).meta({ id: 'DismissRequest' });

// The review line's measure over a window, computed by the bot from what it recorded.
export const LineMetrics = z.object({
  days: z.number().int(),
  jobs: z.object({
    total: z.number().int(), failed: z.number().int(), running: z.number().int(),
    medianMs: nullable(z.number()).describe('Median duration of the runs that ended with a review.'),
    costUsd: z.number(),
  }),
  findings: z.object({
    asProposed: z.number().int(), edited: z.number().int(), dismissed: z.number().int(), pending: z.number().int(),
    unknown: z.number().int().describe('Added to a review whose finding can no longer be read: neither as proposed nor edited can be told.'),
    actedOnRate: nullable(z.number()).describe('Decided comments over decided plus pending; null with none.'),
  }),
}).meta({ id: 'LineMetrics' });
