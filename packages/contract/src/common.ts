import { z } from '@hono/zod-openapi';

// The contract between the studio server and the React app, as zod schemas: the routes
// validate requests with them and the OpenAPI document (/openapi.json) is generated from
// them, so the two cannot drift. Response schemas document what the server sends.
// Shared building blocks.
export const nullable = (schema) => schema.nullable();

export const ErrorBody = z.object({ error: z.string() }).describe('Something went wrong; the message is truncated to 300 characters for GitLab errors.').meta({ id: 'ErrorBody' });
export const Ok = z.object({ ok: z.literal(true) }).meta({ id: 'Ok' });

// `<project key>/<review file name>`: the file name alone can repeat from one project to another.
export const ReviewId = z.string().regex(/^[a-z0-9][a-z0-9-]*\/[\w.-]+$/).describe('Review id: `<project key>/<review file name without .md>`. Send it URL-encoded (`back%2Ffeat-x`).').meta({ id: 'ReviewId' });

export const Verdict = nullable(z.enum(['APPROVE', 'REQUEST_CHANGES', 'OTHER']));
export const ReviewKind = z.enum(['review', 'comments']).describe('`comments` is a triage of reviewer comments on an MR you authored.').meta({ id: 'ReviewKind' });
export const ShapeSource = z.enum(['json', 'markdown', 'none']).describe('Where the findings came from: the command\'s findings file, the report\'s sections, or nowhere (then `warnings` says so).').meta({ id: 'ShapeSource' });

export const DiscussionId = z.string().regex(/^[0-9a-f]{8,64}$/i).describe('GitLab discussion (thread) id.').meta({ id: 'DiscussionId' });
