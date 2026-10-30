import { z } from '@hono/zod-openapi';
import { DiscussionId } from './common.ts';

// What the agent must write to `.marginalia-findings.json`, strictly. The reader in api/ is lenient
// on purpose for reviews already stored; a run that breaks this fails visibly (ADR 0003).
const text = z.string().trim().min(1);
const paths = z.array(text).min(1);

const AgentFinding = z.object({
  id: z.string().regex(/^[\w-]{1,56}$/).optional(),
  severity: z.enum(['critical', 'important', 'suggestion', 'info']),
  title: text.max(300),
  path: text.nullish(),
  line: z.number().int().min(1).nullish(),
  body: text,
  comment: text.nullish(),
}).refine((f) => !f.line || f.path, { message: 'a line needs a path', path: ['line'] });

const AgentChapter = z.object({
  title: text,
  summary: text,
  files: paths,
  findings: z.array(text).optional(),
  threads: z.array(text).optional(),
});

export const AgentReview = z.object({
  verdict: z.enum(['APPROVE', 'REQUEST_CHANGES']),
  summary: text,
  risk: z.object({ level: z.enum(['low', 'medium', 'high']), rationale: text.optional(), factors: z.array(text).optional() }).optional(),
  overview: z.object({ before: text, after: text }),
  tour: z.array(AgentChapter).min(1),
  findings: z.array(AgentFinding),
}).superRefine((r, ctx) => {
  const ids = new Set(r.findings.map((f) => f.id));
  r.tour.forEach((chapter, i) => (chapter.findings ?? []).forEach((id) => {
    if (!ids.has(id)) ctx.addIssue({ code: 'custom', message: `names the finding "${id}", which does not exist`, path: ['tour', i, 'findings'] });
  }));
  if (r.verdict === 'APPROVE' && r.findings.some((f) => f.severity === 'critical' || f.severity === 'important')) {
    ctx.addIssue({ code: 'custom', message: 'APPROVE with a critical or important finding left', path: ['verdict'] });
  }
});

export const AgentTriage = z.object({
  summary: text.optional(),
  findings: z.array(AgentFinding).optional(),
  replies: z.array(z.object({
    thread: DiscussionId,
    verdict: z.enum(['fixed', 'already_fixed', 'not_relevant', 'wrong', 'answered']),
    reply: text,
    resolve: z.boolean(),
  })).min(1),
});
