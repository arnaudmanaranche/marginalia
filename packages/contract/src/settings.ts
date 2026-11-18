import { z } from '@hono/zod-openapi';

export const SETTING_BOUNDS = {
  pollIntervalMinutes: { min: 1, max: 1440 },
  staleAfterDays: { min: 1, max: 365 },
  dailyBudgetUsd: { min: 0, max: 10_000 },
} as const;
const { pollIntervalMinutes: poll, staleAfterDays: stale, dailyBudgetUsd: budget } = SETTING_BOUNDS;

export const Settings = z.object({
  pollIntervalMinutes: z.number().int().min(poll.min).max(poll.max),
  staleAfterDays: z.number().int().min(stale.min).max(stale.max).describe('MRs with no activity for this long are skipped.'),
  allowedTargetBranches: z.array(z.string()).describe('Only these target branches are reviewed; empty means all.'),
  excludeAuthors: z.array(z.string()).describe('GitLab usernames whose MRs are never touched.'),
  showFullDiff: z.boolean(),
  dailyBudgetUsd: z.number().min(budget.min).max(budget.max).describe('What a day of automatic work may cost in USD; 0 is no limit. What a person asks for always runs.'),
}).meta({ id: 'Settings' });

export const SettingsPatch = z.record(z.string(), z.unknown()).describe('Only the keys to change; `null` puts a key back on its default.').meta({ id: 'SettingsPatch' });
export const SettingsAnswer = z.object({ settings: Settings, defaults: Settings }).meta({ id: 'SettingsAnswer' });
