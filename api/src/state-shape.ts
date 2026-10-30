// The on-disk shape of state.json and posted.json once several projects share them.
// Pure, so the migration from the single-project files is tested on plain objects.

// state.json: { version: 2, projects: { <projectKey>: { <iid>: sha, mineComments: {}, stackBelow: {} } } }.
// A file from before projects existed is one project's state: it goes to `firstKey`.
export function migrateState(raw: any, firstKey: string) {
  if (raw && raw.version === 2 && raw.projects) return raw;
  const legacy = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { version: 2, projects: Object.keys(legacy).length && firstKey ? { [firstKey]: legacy } : {} };
}

export function projectState(file: any, key: string) {
  const state = file.projects[key] ?? {};
  state.mineComments ??= {};
  state.stackBelow ??= {};
  return state;
}

// posted.json is keyed `<projectKey>/<review slug>:<comment id>`. A key from before
// projects existed (no "/" before the colon) belongs to `firstKey`.
export const postedKey = (projectKey: string, slug: string, id: string) => `${projectKey}/${slug}:${id}`;

export function migratePosted(raw: any, firstKey: string) {
  const out: Record<string, any> = {};
  for (const [key, info] of Object.entries(raw ?? {})) {
    const owned = key.slice(0, key.indexOf(':')).includes('/');
    out[owned || !firstKey ? key : `${firstKey}/${key}`] = info;
  }
  return out;
}
