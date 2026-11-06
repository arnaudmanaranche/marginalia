import { z } from '@hono/zod-openapi';
import { ReviewId, nullable } from './common.ts';
import { Failure } from './review-item.ts';

const StageState = z.enum(['pending', 'running', 'done', 'failed', 'skipped']);
const LiveStage = z.object({ id: z.string(), label: z.string(), state: StageState });
export const RunStage = LiveStage.extend({ startedAt: nullable(z.string()), endedAt: nullable(z.string()) }).meta({ id: 'RunStage' });
export const RunStep = z.object({ at: z.string(), text: z.string(), stage: nullable(z.string()), sub: z.boolean().describe('Taken by a sub-agent the run started.'), tool: z.string().optional().describe('The tool the step called, short: `read`, `git`, `jira.search`.') }).meta({ id: 'RunStep' });
const RunFields = {
  id: z.string(), slug: ReviewId, project: z.string(), iid: z.union([z.number().int(), z.string()]).nullable().describe('Null for a branch without an MR yet, or a job about the whole project.'),
  kind: z.enum(['review', 'triage', 'understand']), command: z.string(),
  startedAt: z.string(), endedAt: nullable(z.string()),
  outcome: z.enum(['running', 'reviewed', 'skipped', 'failed']),
  error: nullable(z.string()),
  failure: nullable(Failure),
  stages: z.array(RunStage),
  stepCount: z.number().int(),
  cost: nullable(z.object({ usd: z.number(), turns: z.number(), outputTokens: z.number() })),
};
export const RunSummary = z.object(RunFields).describe('One run of the bot on a review, without its steps.').meta({ id: 'RunSummary' });
export const Runs = z.object({ runs: z.array(RunSummary) }).meta({ id: 'Runs' });
export const Doctor = z.object({
  state: z.enum(['running', 'done', 'failed']),
  startedAt: z.string().optional(), endedAt: z.string().optional(),
  summary: z.string().optional(), cause: z.string().optional(),
  where: z.enum(['bot', 'agent', 'environment', 'gitlab', 'claude', 'repo']).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  evidence: z.array(z.string()).optional(), retryWillWork: z.boolean().optional(),
  fix: z.object({ inBot: z.boolean(), what: nullable(z.string()), files: z.array(z.string()) }).optional(),
  sameAs: z.string().optional().describe('Reused from an earlier run that failed the same way.'),
  error: z.string().optional(),
}).passthrough().describe("The doctor's diagnosis of a failed run.").meta({ id: 'Doctor' });
export const DoctorFix = z.object({
  state: z.enum(['running', 'ready', 'nothing', 'failed', 'pushed']),
  branch: z.string().optional(), commit: z.string().optional(), diffStat: z.string().optional(),
  testsPassed: z.boolean().optional(), note: z.string().optional(), error: z.string().optional(),
  url: nullable(z.string()).optional().describe('Where the remote offers to open a merge request for the branch.'),
}).passthrough().describe('The fix the doctor prepared on a branch of Marginalia.').meta({ id: 'DoctorFix' });
export const ToolCallRecord = z.object({
  id: z.string(), tool: z.string().describe('Short, for a chip: `read`, `git`, `jira.search`.'), what: z.string().describe('The step in words: `Reading app.ts`.'),
  sub: z.boolean(), stage: nullable(z.string()), startedAt: z.string(), endedAt: nullable(z.string()), ms: nullable(z.number()),
  ok: nullable(z.boolean()).describe('Null while it runs, or when the run ended before its result.'), error: nullable(z.string()).describe('The first line of a failed result.'),
}).describe('One tool call of a run, paired with its result.').meta({ id: 'ToolCallRecord' });
export const StageUsage = z.object({
  model: nullable(z.string()), calls: z.number().int(), turns: z.number(), usd: z.number(), ms: z.number(),
  inputTokens: z.number(), outputTokens: z.number(), cacheReadTokens: z.number(), cacheWriteTokens: z.number(),
}).describe("What one stage's Claude calls used.").meta({ id: 'StageUsage' });
export const RunTrace = z.object({
  ...RunFields, steps: z.array(RunStep), doctor: nullable(Doctor), fix: nullable(DoctorFix),
  calls: z.array(ToolCallRecord).optional().describe('Absent on a run from before tool calls were kept.'),
  droppedCalls: z.number().int().optional(),
  usage: z.record(z.string(), StageUsage).optional().describe('By stage id.'),
  found: z.array(z.object({
    id: z.string(), stage: z.string(), severity: z.string(), title: z.string(), path: nullable(z.string()), line: nullable(z.number().int()), at: z.string(),
  })).optional().describe('Findings as each chapter gave them, before the report weighs and merges them.'),
  fixSource: z.object({ available: z.boolean(), why: z.string().optional() }).describe('Whether the doctor can prepare fixes on this install.'),
}).describe('One run with every step it took.').meta({ id: 'RunTrace' });

export const BotStatus = z.object({
  pid: z.number().int(),
  phase: z.enum(['idle', 'polling', 'reviewing', 'error', 'stopped']),
  current: nullable(z.object({ project: z.string().optional(), iid: z.number().int().nullable(), title: z.string(), startedAt: z.string(), progress: z.array(z.string()).optional(), runId: z.string().optional(), slug: ReviewId.optional(), stages: z.array(LiveStage).optional(), stepCount: z.number().int().optional() })),
  running: z.array(z.object({ project: z.string().optional(), iid: z.union([z.number().int(), z.string()]).nullable(), title: z.string(), startedAt: z.string() }).passthrough()).optional()
    .describe('Every MR under review now, one per project at most; `current` is the one that started last.'),
  lastPoll: nullable(z.object({ at: z.string(), ok: z.boolean(), error: nullable(z.string()) })),
  nextPollAt: nullable(z.string()),
  mrs: z.array(z.object({
    project: z.string().optional(), iid: z.number().int().nullable(), status: z.string(), reviewPath: nullable(z.string()).optional(),
    held: z.literal('budget').optional().describe('Set when the daily budget made its automatic work wait until midnight.'),
  }).passthrough()).optional(),
  budget: nullable(z.object({ spentUsd: z.number(), limitUsd: nullable(z.number()), over: z.boolean() })).optional()
    .describe('Today\'s spend against the daily budget (GLOSSARY: Budget), as of the last task that ended.'),
}).describe('Content of `status.json`, written by the poller.').meta({ id: 'BotStatus' });

export const BotState = z.object({ status: nullable(BotStatus), alive: z.boolean() }).meta({ id: 'BotState' });

// A job of the factory (ADR 0006): one run of a line on one target, from the run journal, newest
// first. `what` says which: a review, a triage of my MR's comments, an own review, or learning the project.
export const Job = RunSummary.extend({
  what: z.enum(['review', 'comments', 'own', 'understand']),
  title: nullable(z.string()).describe('The MR or branch title when the bot still tracks it.'),
}).meta({ id: 'Job' });
export const Jobs = z.object({ jobs: z.array(Job) }).meta({ id: 'Jobs' });
