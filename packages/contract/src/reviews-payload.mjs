// @ts-check
import { z } from '@hono/zod-openapi';
import { nullable } from './common.mjs';
import { Settings } from './settings.mjs';
import { ReviewItem, Stack } from './review-item.mjs';
import { BotStatus } from './runs.mjs';

export const PostedInfo = z.object({
  at: z.string(),
  iid: z.number().int(),
  url: z.string().describe('The note once published; the merge request until then.'),
  state: z.enum(['draft', 'published']).optional().describe('`draft`: in the pending review. Absent on older records, which are published.'),
  inline: z.boolean().optional().describe('`false` when GitLab refused the line anchor and the comment went up as a general note.'),
}).passthrough().meta({ id: 'PostedInfo' });

export const ReviewsPayload = z.object({
  status: nullable(BotStatus),
  items: z.array(ReviewItem),
  stacks: z.array(Stack),
  projectUrl: nullable(z.string()),
  projects: z.array(z.object({ key: z.string(), kind: nullable(z.enum(['back', 'front'])), gitlabProjectId: z.string(), url: nullable(z.string()) })),
  jiraBaseUrl: nullable(z.string()),
  settings: Settings,
  settingsDefaults: Settings,
  allowPosting: z.boolean().describe('Posting on other people\'s merge requests. Your own are always open to replies and pushes.'),
  posted: z.record(z.string(), PostedInfo).describe('Keyed by `<project>/<review slug>:<commentId>`.'),
}).meta({ id: 'ReviewsPayload' });
