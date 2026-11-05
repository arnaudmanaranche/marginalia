import { z } from '@hono/zod-openapi';

// What an Understand job must write to `.marginalia-context.json`, strictly: the project context
// of one repository, whatever its stack (ADR 0006). The sections are the same for a front-end and a
// back-end; what fills them differs. Every item cites where it was learned, so a person approving
// the context can check it and nothing is invented.
const text = z.string().trim().min(1);

export const ContextSource = z.object({
  kind: z.enum(['file', 'ticket', 'page', 'thread', 'query', 'url']).describe('A repo file, a tracker ticket, a doc page, a chat thread, an analytics query, or another link.'),
  ref: text.max(500).describe('The path, key, URL or query that was read.'),
}).meta({ id: 'ContextSource' });

const sources = z.array(ContextSource).min(1);
const where = z.array(text).optional().describe('Repo-relative files or folders where this lives.');

const ContextItem = z.object({ name: text.max(200), summary: text, where, sources });

export const ContextTerm = ContextItem.extend({
  codeNames: z.array(text).optional().describe('How the code spells it.'),
  avoid: z.array(text).optional().describe('Words not to use for it.'),
}).meta({ id: 'ContextTerm' });

export const ContextCriticalPath = ContextItem.extend({
  rank: z.number().int().min(1).describe('1 is the flow whose breakage costs the most.'),
  steps: z.array(text).optional(),
  tests: z.array(text).optional().describe('Tests that cover it, repo-relative.'),
  fragile: z.array(text).optional().describe('Known weak spots, from bug history or the code.'),
}).meta({ id: 'ContextCriticalPath' });

export const AgentProjectContext = z.object({
  summary: text.describe('What this repository is for, in two or three plain sentences.'),
  glossary: z.array(ContextTerm).min(1),
  stack: z.array(ContextItem).min(1),
  features: z.array(ContextItem).min(1),
  criticalPaths: z.array(ContextCriticalPath).min(1),
}).superRefine((c, ctx) => {
  const ranks = c.criticalPaths.map((p) => p.rank);
  if (new Set(ranks).size !== ranks.length) ctx.addIssue({ code: 'custom', message: 'two critical paths share a rank', path: ['criticalPaths'] });
}).meta({ id: 'AgentProjectContext' });

// As the bot stores it: the agent's context, where it was learned, and whether a person approved it.
// Reviews only use an approved context.
export const StoredProjectContext = z.object({
  project: text,
  commit: text.describe('The commit of the default branch the context was learned at.'),
  learnedAt: text,
  state: z.enum(['draft', 'approved']),
  approvedBy: text.nullable(),
  approvedAt: text.nullable(),
  context: AgentProjectContext,
}).meta({ id: 'StoredProjectContext' });

// A project's context as the studio sees it: the draft waiting for a person, and the approved one
// reviews use. Either can be missing.
export const ProjectContextState = z.object({
  project: text,
  draft: StoredProjectContext.nullable(),
  approved: StoredProjectContext.nullable(),
  learning: z.boolean().describe('An Understand job of this project is queued or running in this bot.'),
}).meta({ id: 'ProjectContextState' });

// What Home needs to say a draft waits: per project, when each version was learned.
export const ContextSummaries = z.object({
  contexts: z.array(z.object({
    project: text,
    draftLearnedAt: text.nullable(),
    approvedAt: text.nullable(),
  })),
}).meta({ id: 'ContextSummaries' });
