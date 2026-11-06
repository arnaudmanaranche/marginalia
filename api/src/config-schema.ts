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
  // Triage the reviewer comments on my own MRs; false ignores my own MRs.
  triage: z.boolean().default(true),
  allowedTargetBranches: list,
  excludeAuthors: list,
  // Review my own MRs too, for me alone (an own review is never posted).
  reviewOwn: z.boolean().default(false),
  // Reproduce findings about behaviour in a disposable runner (ADR 0009). Off until a person opts in.
  verify: z.boolean().default(false),
  verifyLimits: z.object({
    cpus: z.number().positive().max(16),
    memoryMb: z.number().int().min(256).max(65_536),
    pids: z.number().int().min(16).max(8192),
    timeoutMinutes: z.number().positive().max(120),
  }).partial().optional(),
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
export function parseConfig(raw: any) {
  const result = ConfigSchema.safeParse(raw);
  if (result.success) return { ok: true as const, config: result.data };
  return { ok: false as const, errors: result.error.issues.map((i) => `${i.path.join('.') || 'config'}: ${i.message}`) };
}
