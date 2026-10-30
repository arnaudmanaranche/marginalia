import { z } from 'zod';

// team.json, the file at the root of the shared team repo: defaults and the list of
// GitLab projects the team reviews. Pure (no config or I/O import), like config-schema.ts.
// It carries no local path and no secret: each dev maps a project to their own checkout.

const list = z.array(z.string().trim().min(1));
const semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'a version like 2.0.0');

// Fields a team can set for a project (and as the default of every project).
const reviewFields = {
  reviewCommand: z.string().trim().min(1).optional(),
  // Empty disables the triage of your own MRs.
  triageCommand: z.string().trim().optional(),
  allowedTargetBranches: list.optional(),
  excludeAuthors: list.optional(),
};

// Strict on purpose: a typo ("excludeAuthor") would otherwise be silently ignored.
export const TeamProjectSchema = z.strictObject({
  gitlabProjectId: z.string().trim().min(1),
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes').optional(),
  kind: z.enum(['back', 'front']).optional(),
  ...reviewFields,
});

export const TeamSchema = z.strictObject({
  version: z.literal(1),
  name: z.string().trim().min(1),
  minMarginalia: semver.optional(),
  defaults: z.strictObject({
    ...reviewFields,
    claudeExtraAllowedTools: list.optional(),
    reviewPromptExtra: z.string().optional(),
  }).default({}),
  projects: z.array(TeamProjectSchema).default([]).refine(
    (ps) => new Set(ps.map((p) => p.gitlabProjectId)).size === ps.length,
    'a GitLab project is listed twice',
  ),
});

// [major, minor, patch] of "2.1.0" (a pre-release or build suffix is ignored), or null.
export function parseSemver(text: unknown) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(text ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// Negative, 0 or positive like a comparator; null when either side is not a version.
export function compareSemver(a: unknown, b: unknown) {
  const [x, y] = [parseSemver(a), parseSemver(b)];
  if (!x || !y) return null;
  const i = x.findIndex((n, k) => n !== y[k]);
  return i === -1 ? 0 : x[i] - y[i];
}

// True when `running` is at least `min`; an absent min is always satisfied.
export const satisfiesMin = (min: unknown, running: unknown) => !min || (compareSemver(running, min) ?? 0) >= 0;

// { ok: true, team } or { ok: false, errors: ['projects.0.kind: ...'] }. Too new a team
// repo is reported first and on its own: its other fields may be ones this version
// does not know, so listing them as typos would send the dev the wrong way.
export function parseTeam(raw: any, running: unknown) {
  const min = raw?.minMarginalia;
  if (typeof min === 'string' && parseSemver(min) && !satisfiesMin(min, running)) {
    return { ok: false, tooOld: true, errors: [`minMarginalia: this team repo needs marginalia ${min} or newer (this is ${running})`] };
  }
  const result = TeamSchema.safeParse(raw);
  if (result.success) return { ok: true, team: result.data };
  return { ok: false, errors: result.error.issues.map((i) => `${i.path.join('.') || 'team.json'}: ${i.message}`) };
}
