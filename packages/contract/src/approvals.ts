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
