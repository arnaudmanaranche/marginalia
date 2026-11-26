import { z } from '@hono/zod-openapi';
import { ReviewId, nullable, Severity } from './common.ts';

// The recap of a re-reviewed merge request: what became of what was said, and what is new, since
// the baseline (GLOSSARY: Recap, Baseline, Standing, Signals, Reworded).

export const Standing = z.enum(['addressed', 'contested', 'untouched', 'dropped']).describe('Where a comment I posted stands. Decided in order: `dropped` if I chose not to send it; `contested` if its thread is resolved over code known to be untouched; `addressed` if the code changed or its thread is resolved; else `untouched`. Never overclaims: a reply alone, bot silence or an unknown code state are `untouched`.').meta({ id: 'Standing' });

export const Signals = z.object({
  linesChanged: nullable(z.boolean()).describe('Whether the flagged code changed since the baseline; null when that cannot be told (the version is gone, a collapsed file, a comment on the whole MR or file).'),
  replied: z.boolean().describe('Someone other than me, and not a bot, replied in the thread. Shown, never weighed.'),
  resolved: z.boolean(),
}).meta({ id: 'Signals' });

export const RecapComment = z.object({
  findingId: z.string(), title: z.string(), path: nullable(z.string()), line: nullable(z.number().int().min(1)),
  standing: Standing, signals: Signals,
  disagreement: z.boolean().describe('The thread and the code say different things: worth a look.'),
  url: nullable(z.string()).describe('The comment on GitLab.'),
}).refine((c) => c.line === null || c.path !== null, { message: 'a line needs a path', path: ['line'] }).meta({ id: 'RecapComment' });

export const RecapFinding = z.object({
  id: z.string(), title: z.string(), severity: nullable(Severity), path: nullable(z.string()), line: nullable(z.number().int().min(1)),
  onChangedCode: nullable(z.boolean()).describe('Whether this finding is on code changed since the baseline. For a new finding, false means older code the bot only raised now. Null when that cannot be told.'),
}).refine((f) => f.line === null || f.path !== null, { message: 'a line needs a path', path: ['line'] }).meta({ id: 'RecapFinding' });

export const RecapReworded = z.object({ was: RecapFinding, now: RecapFinding }).describe('Probably one finding said differently: for a person to judge, never counted as one gone and one new.').meta({ id: 'RecapReworded' });

export const RecapBaseline = z.object({
  kind: z.enum(['submitted', 'previous']).describe('`submitted`: the report I last submitted from. `previous`: nothing submitted, so the report before the current one.'),
  at: nullable(z.string()).describe('When I submitted, or when the previous report was written.'),
}).meta({ id: 'RecapBaseline' });

export const RecapMr = z.object({
  commits: z.number().int().min(0), files: z.number().int().min(0),
  commentedFilesTouched: z.number().int().min(0).describe('Of the files I commented on, how many changed.'),
}).meta({ id: 'RecapMr' });

export const RecapCounts = z.object({
  addressed: z.number().int().min(0), contested: z.number().int().min(0), untouched: z.number().int().min(0), dropped: z.number().int().min(0),
  newFindings: z.number().int().min(0), reworded: z.number().int().min(0), gone: z.number().int().min(0),
}).describe('One summary, computed once: the recap, the finding list and the MR row all read it.').meta({ id: 'RecapCounts' });

export const Recap = z.object({
  slug: ReviewId,
  baseline: RecapBaseline,
  mr: nullable(RecapMr).describe('Null when the code that changed cannot be told: the version the baseline covered is no longer on GitLab.'),
  comments: z.array(RecapComment),
  newFindings: z.array(RecapFinding),
  reworded: z.array(RecapReworded),
  gone: z.array(RecapFinding).describe('Findings the bot no longer raises. Information only: bot silence is not an answer.'),
  counts: RecapCounts,
}).meta({ id: 'Recap' });

export const RecapResponse = z.object({
  recap: nullable(Recap).describe('Null when there is nothing to compare: the first review of an MR, or no report before this one.'),
}).meta({ id: 'RecapResponse' });
