import { z } from '@hono/zod-openapi';
import { nullable } from './common.ts';

// The bot's queue (GLOSSARY: Queue, Task): what waits, what runs, what just ended, and the jobs each
// task started, so a person sees why a mention has not been answered yet and what a poll cost.

const TaskJob = z.object({
  slug: z.string(), id: z.string(), outcome: z.enum(['running', 'reviewed', 'skipped', 'failed']),
  title: nullable(z.string()), startedAt: z.string(), endedAt: nullable(z.string()), costUsd: nullable(z.number()),
}).describe('A job the task started, from the run journal.').meta({ id: 'TaskJob' });

export const QueueTask = z.object({
  id: z.string(),
  kind: z.enum(['poll', 'mention', 'understand', 'rerun']).or(z.string()),
  project: nullable(z.string()).describe('Null for a task about every project, a poll.'),
  label: z.string(),
  priority: z.enum(['high', 'normal']).describe('High when a person asked for it; it goes before the polls.'),
  status: z.enum(['queued', 'running', 'done', 'failed']),
  enqueuedAt: z.string(), startedAt: nullable(z.string()), endedAt: nullable(z.string()),
  attempt: z.number().int().describe('Above 1 when a restart cut an earlier attempt short.'),
  maxAttempts: z.number().int(),
  error: nullable(z.string()),
  position: nullable(z.number().int()).describe('Its place in line, 1 being next; null unless it waits.'),
  detail: nullable(z.string()).describe('What the running task is on right now.'),
  jobs: z.array(TaskJob),
}).meta({ id: 'QueueTask' });

export const QueueWorker = z.object({
  id: z.string(), name: z.string(), detail: nullable(z.string()), taskId: nullable(z.string()),
}).describe('A slot that runs one task at a time.').meta({ id: 'QueueWorker' });

export const Budget = z.object({
  since: z.string().describe('Local midnight: the day the spend counts from.'),
  resetsAt: z.string().describe('The next local midnight, when the spend starts again from zero.'),
  limitUsd: nullable(z.number()).describe('What a day of automatic work may cost; null when there is no limit.'),
  spentUsd: z.number().describe('What every Claude run recorded today cost, asked for or automatic.'),
  leftUsd: nullable(z.number()),
  over: z.boolean().describe('True once the spend reaches the limit: automatic work waits, what a person asks for still runs.'),
  runs: z.number().int(),
  byKind: z.array(z.object({ kind: z.string(), usd: z.number(), runs: z.number().int() })).describe('Most expensive first.'),
  byMr: z.array(z.object({ project: nullable(z.string()), iid: z.union([z.number(), z.string()]), usd: z.number(), runs: z.number().int() })).describe('The MRs that cost the most today, every run on them together.'),
}).describe('The daily budget (GLOSSARY: Budget).').meta({ id: 'Budget' });

export const QueueView = z.object({
  now: z.string().describe('The bot\'s clock, on the same scale as the task times.'),
  workers: z.array(QueueWorker),
  tasks: z.array(QueueTask).describe('Waiting and running tasks, then the latest finished ones, newest first.'),
  totals: z.object({ done: z.number().int(), failed: z.number().int() }).describe('Finished tasks the database still keeps.'),
  budget: nullable(Budget).describe('Null when it could not be read.'),
}).meta({ id: 'QueueView' });
