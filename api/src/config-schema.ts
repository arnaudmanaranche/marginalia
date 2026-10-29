import { z } from 'zod';

// The shape of the team-ready config: settings shared by every project, and one
// entry per GitLab project (a back and a front repo are two projects).
const list = z.array(z.string().trim().min(1)).default([]);

export const ProjectSchema = z.object({
  // Numeric id, or "group/subgroup/project".
  gitlabProjectId: z.string().trim().min(1),
  // Short name used in studio URLs, state and worktree folders. Derived from the
  // GitLab path when omitted (group/back-end -> back-end).
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes').optional(),
  repoLocalPath: z.string().trim().min(1),
  kind: z.enum(['back', 'front']).optional(),
  reviewCommand: z.string().trim().default('/code-review'),
  // Empty disables the triage of your own MRs.
  triageCommand: z.string().trim().default('/mr-comments'),
  allowedTargetBranches: list,
  excludeAuthors: list,
});

export const ConfigSchema = z.object({
  gitlabBaseUrl: z.string().trim().min(1).transform((u) => u.replace(/\/+$/, '')),
  gitlabUsername: z.string().trim().min(1),
  gitlabToken: z.string().trim().min(1),
  claudeBin: z.string().trim().default('claude'),
  sandbox: z.boolean().default(true),
  notifications: z.boolean().default(true),
  // Clone URL of the shared team repo (skills and defaults, see src/team-sync.ts).
  teamRepo: z.string().trim().min(1).optional(),
  studioPort: z.coerce.number().int().min(0).max(65535).default(4477),
  projects: z.array(ProjectSchema).min(1).refine(
    (ps) => new Set(ps.map((p) => p.gitlabProjectId)).size === ps.length,
    'a GitLab project is listed twice',
  ),
});

// { ok: true, config } or { ok: false, errors: ['projects.0.repoLocalPath: ...'] }
export function parseConfig(raw) {
  const result = ConfigSchema.safeParse(raw);
  if (result.success) return { ok: /** @type {const} */ (true), config: result.data };
  return { ok: /** @type {const} */ (false), errors: result.error.issues.map((i) => `${i.path.join('.') || 'config'}: ${i.message}`) };
}
