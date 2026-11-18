import { z } from '@hono/zod-openapi';

export const nullable = (schema) => schema.nullable();

export const ErrorBody = z.object({ error: z.string() }).describe('Something went wrong; the message is truncated to 300 characters for GitLab errors.').meta({ id: 'ErrorBody' });
export const Ok = z.object({ ok: z.literal(true) }).meta({ id: 'Ok' });

// `<project key>/<review file name>`: the file name alone can repeat from one project to another.
export const ReviewId = z.string().regex(/^[a-z0-9][a-z0-9-]*\/[\w.-]+$/).describe('Review id: `<project key>/<review file name without .md>`. Send it URL-encoded (`back%2Ffeat-x`).').meta({ id: 'ReviewId' });

export const Severity = z.enum(['critical', 'important', 'suggestion', 'info']);
export const RiskLevel = z.enum(['low', 'medium', 'high']);
export const FindingProof = z.enum(['runtime', 'static']);
export const VerificationStatus = z.enum(['reproduced', 'not_reproduced', 'inconclusive', 'skipped']);
export const ReplyVerdict = z.enum(['fixed', 'already_fixed', 'not_relevant', 'wrong', 'answered']);

// A project key: lowercase letters, digits and dashes.
export const PROJECT_KEY = /^[a-z0-9][a-z0-9-]*$/;

export const Verdict = nullable(z.enum(['APPROVE', 'REQUEST_CHANGES', 'OTHER']));
export const ReviewKind = z.enum(['review', 'comments', 'own']).describe('`comments` is a triage of reviewer comments on an MR you authored; `own` is a review of your own MR or branch, shown to you alone and never posted.').meta({ id: 'ReviewKind' });
export const ShapeSource = z.enum(['json', 'markdown', 'none']).describe('Where the findings came from: the command\'s findings file, the report\'s sections, or nowhere (then `warnings` says so).').meta({ id: 'ShapeSource' });

export const DiscussionId = z.string().regex(/^[0-9a-f]{8,64}$/i).describe('GitLab discussion (thread) id.').meta({ id: 'DiscussionId' });
