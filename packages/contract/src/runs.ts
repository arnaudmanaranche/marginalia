import { z } from '@hono/zod-openapi';
import { ReviewId, nullable } from './common.ts';
import { Failure } from './review-item.ts';

const StageState = z.enum(['pending', 'running', 'done', 'failed', 'skipped']);
const LiveStage = z.object({ id: z.string(), label: z.string(), state: StageState });
export const RunStage = LiveStage.extend({ startedAt: nullable(z.string()), endedAt: nullable(z.string()) }).meta({ id: 'RunStage' });
export const RunStep = z.object({ at: z.string(), text: z.string(), stage: nullable(z.string()), sub: z.boolean().describe('Taken by a sub-agent the run started.') }).meta({ id: 'RunStep' });
const RunFields = {
  id: z.string(), slug: ReviewId, project: z.string(), iid: z.union([z.number().int(), z.string()]),
  kind: z.enum(['review', 'triage']), command: z.string(),
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
export const RunTrace = z.object({
  ...RunFields, steps: z.array(RunStep), doctor: nullable(Doctor), fix: nullable(DoctorFix),
  fixSource: z.object({ available: z.boolean(), why: z.string().optional() }).describe('Whether the doctor can prepare fixes on this install.'),
}).describe('One run with every step it took.').meta({ id: 'RunTrace' });

export const BotStatus = z.object({
  pid: z.number().int(),
  phase: z.enum(['idle', 'polling', 'reviewing', 'error', 'stopped']),
  current: nullable(z.object({ project: z.string().optional(), iid: z.number().int(), title: z.string(), startedAt: z.string(), progress: z.array(z.string()).optional(), runId: z.string().optional(), slug: ReviewId.optional(), stages: z.array(LiveStage).optional(), stepCount: z.number().int().optional() })),
  lastPoll: nullable(z.object({ at: z.string(), ok: z.boolean(), error: nullable(z.string()) })),
  nextPollAt: nullable(z.string()),
  mrs: z.array(z.object({ project: z.string().optional(), iid: z.number().int(), status: z.string(), reviewPath: nullable(z.string()).optional() }).passthrough()).optional(),
}).describe('Content of `status.json`, written by the poller.').meta({ id: 'BotStatus' });

export const BotState = z.object({ status: nullable(BotStatus), alive: z.boolean() }).meta({ id: 'BotState' });
