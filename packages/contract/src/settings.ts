import { z } from '@hono/zod-openapi';

export const Settings = z.object({
  pollIntervalMinutes: z.number().int().min(1).max(1440),
  staleAfterDays: z.number().int().min(1).max(365).describe('MRs with no activity for this long are skipped.'),
  allowedTargetBranches: z.array(z.string()).describe('Only these target branches are reviewed; empty means all.'),
  excludeAuthors: z.array(z.string()).describe('GitLab usernames whose MRs are never touched.'),
  showFullDiff: z.boolean(),
}).meta({ id: 'Settings' });

export const SettingsPatch = z.record(z.string(), z.unknown()).describe('Only the keys to change; `null` puts a key back on its default.').meta({ id: 'SettingsPatch' });
export const SettingsAnswer = z.object({ settings: Settings, defaults: Settings }).meta({ id: 'SettingsAnswer' });
