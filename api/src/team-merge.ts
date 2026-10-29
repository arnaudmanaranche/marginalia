// Layers a team's defaults under a dev's config. Pure: plain objects in, plain objects out.
//
// Precedence, highest first: the dev's own value > the team's entry for that project >
// the team's defaults > the built-in defaults (which parseConfig applies afterwards).
// It works on the RAW config.json (before parseConfig): once parsed, a value the dev
// never wrote ("/code-review") looks the same as one they chose, and the team could
// not tell what it may fill. The result goes through parseConfig as usual.
//
// A team project reaches the dev's projects[] only when the dev has a projects[] entry
// for it (that entry holds their repoLocalPath: the team file has no path). The others
// are returned in `unmapped`, for doctor and the CLI to say "map these".

// Per-project fields a team can set. `key` and `kind` only come from the team's entry.
const FIELDS = ['key', 'kind', 'reviewCommand', 'triageCommand', 'allowedTargetBranches', 'excludeAuthors'];
const FROM_DEFAULTS = new Set(['reviewCommand', 'triageCommand', 'allowedTargetBranches', 'excludeAuthors']);

const isSet = (v) => v !== undefined && v !== null;
const words = (text) => String(text ?? '').split(/\s+/).filter(Boolean);

function mergeProject(dev, teamProject, defaults) {
  const merged = { ...dev };
  const fromTeam: any[] = [];
  for (const field of FIELDS) {
    if (isSet(dev[field])) continue;
    const [value, source] = isSet(teamProject?.[field]) ? [teamProject[field], 'team project']
      : FROM_DEFAULTS.has(field) && isSet(defaults[field]) ? [defaults[field], 'team defaults']
        : [undefined, null];
    if (value === undefined) continue;
    merged[field] = Array.isArray(value) ? [...value] : value;
    fromTeam.push({ project: dev.gitlabProjectId, field, value, source });
  }
  return { merged, fromTeam };
}

// The two settings that live in the environment, not in config.json. The dev's
// REVIEW_PROMPT_EXTRA wins; extra tools are added to theirs, never replacing them.
function mergeGlobals(defaults, env) {
  const devTools = words(env.CLAUDE_EXTRA_ALLOWED_TOOLS);
  const teamTools = (defaults.claudeExtraAllowedTools ?? []).filter((t) => !devTools.includes(t));
  const devExtra = (env.REVIEW_PROMPT_EXTRA ?? '').trim();
  const teamExtra = (defaults.reviewPromptExtra ?? '').trim();
  return {
    claudeExtraAllowedTools: [...devTools, ...teamTools],
    teamAllowedTools: teamTools,
    reviewPromptExtra: devExtra || teamExtra,
    reviewPromptExtraFromTeam: !devExtra && Boolean(teamExtra),
  };
}

// -> { config, fromTeam: [{ project, field, value, source }], unmapped: [teamProject], globals }
export function mergeTeam(rawConfig, team, { env = {} } = {}) {
  const defaults = team?.defaults ?? {};
  const teamProjects = team?.projects ?? [];
  const byId = new Map(teamProjects.map((p) => [p.gitlabProjectId, p]));
  const fromTeam: any[] = [];
  const projects = (rawConfig.projects ?? []).map((dev) => {
    const result = mergeProject(dev, byId.get(dev.gitlabProjectId), defaults);
    fromTeam.push(...result.fromTeam);
    return result.merged;
  });
  const mapped = new Set(projects.map((p) => p.gitlabProjectId));
  return {
    config: { ...rawConfig, projects },
    fromTeam,
    unmapped: teamProjects.filter((p) => !mapped.has(p.gitlabProjectId)),
    globals: mergeGlobals(defaults, env),
  };
}
