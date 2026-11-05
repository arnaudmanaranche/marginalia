import { z } from '@hono/zod-openapi';
import { nullable } from './common.ts';

const Note = z.object({ id: z.number().int(), author: nullable(z.string()), authorName: nullable(z.string()), mine: z.boolean(), bot: z.boolean().optional(), body: z.string(), at: z.string(), path: nullable(z.string()), line: nullable(z.number().int()) }).meta({ id: 'DiscussionNote' });
export const Thread = z.object({
  id: z.string(), resolved: z.boolean(), resolvable: z.boolean(), path: nullable(z.string()), line: nullable(z.number().int()),
  side: nullable(z.enum(['new', 'old'])), headSha: nullable(z.string()), outdated: z.boolean(), notes: z.array(Note),
}).meta({ id: 'Thread' });
export const Threads = z.object({ threads: z.array(Thread) }).meta({ id: 'Threads' });

export const DiffFile = z.object({
  path: z.string(), oldPath: nullable(z.string()), status: z.enum(['added', 'deleted', 'renamed', 'modified']),
  additions: z.number().int(), deletions: z.number().int(), omitted: z.boolean(), lines: z.array(z.record(z.string(), z.unknown())),
}).meta({ id: 'DiffFile' });
export const Diff = z.object({ files: z.array(DiffFile), reviewedSha: nullable(z.string()).optional(), approximate: z.boolean().optional() }).meta({ id: 'Diff' });

export const Pushes = z.object({
  pushes: z.array(z.object({
    n: z.number().int(), headSha: z.string(), baseSha: z.string(), at: z.string(),
    commits: z.array(z.object({ sha: z.string(), title: z.string() })).describe('The commits this push added, newest first.'),
    rebased: z.boolean().describe('The base moved: the push is a rebase, its commits are the whole branch again.'),
    youReviewed: z.boolean().describe('Your last review on GitLab was of this push.'),
    reports: z.array(nullable(z.string())).describe('The bot\'s reports written on this push, newest first: an earlier version id (`/api/history/{slug}/{id}`), or null for the current report.'),
    head: z.boolean(),
  })),
  defaultFrom: nullable(z.string()).describe('The head of the push you last reviewed, unless it is the MR\'s head: where to start reading.'),
}).meta({ id: 'Pushes' });

export const DraftNote = z.object({ id: z.number().int(), body: z.string(), path: nullable(z.string()), line: nullable(z.number().int()) }).meta({ id: 'DraftNote' });
export const Drafts = z.object({ drafts: z.array(DraftNote) }).meta({ id: 'Drafts' });

export const FixesStatus = z.object({
  ref: z.string(), branch: z.string(), state: z.enum(['none', 'ready', 'pushed', 'outdated']),
  fixesSha: nullable(z.string()), remoteSha: nullable(z.string()),
  commits: z.array(z.object({
    sha: z.string(), subject: z.string(),
    thread: nullable(z.string()).describe('The reviewer thread this fix answers (its `Marginalia-Thread` trailer).'),
    merge: z.boolean().describe('The merge of the target branch that settled the MR\'s conflicts.'),
  })).describe('The commits a push adds, newest first (only when `ready`).'),
  landed: z.array(z.object({ thread: z.string(), sha: z.string() })).describe('The fixes already on the MR branch, by thread: the commit a "fixed" reply names.'),
  note: z.string().optional().describe('After pushing one fix alone: what became of the others, when they could not follow.'),
}).meta({ id: 'FixesStatus' });
