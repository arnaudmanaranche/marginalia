import { join } from 'node:path';

// A project is one GitLab project watched on this machine (a back and a front repo
// are two). Everything that used to be a global (repo, worktree, reviews dir,
// commands) hangs off it. Pure: built from the validated config, no disk access.

// group/sub/back-end -> back-end; a numeric id has no name, so p123.
export function deriveKey(gitlabProjectId: string) {
  const last = gitlabProjectId.split('/').filter(Boolean).pop() ?? '';
  const slug = last.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return /^\d+$/.test(slug) || !slug ? `p${slug || 'x'}` : slug;
}

// Explicit keys must be unique; derived ones get -2, -3 ... when two projects share a name.
function assignKeys(projects: any[]) {
  const taken = new Set();
  for (const p of projects) {
    if (!p.key) continue;
    if (taken.has(p.key)) throw new Error(`project key "${p.key}" is used twice`);
    taken.add(p.key);
  }
  return projects.map((p: any) => {
    if (p.key) return p.key;
    const base = deriveKey(p.gitlabProjectId);
    let key = base;
    for (let n = 2; taken.has(key); n += 1) key = `${base}-${n}`;
    taken.add(key);
    return key;
  });
}

// `legacyWorktreeDir` is where an existing install already has its bot worktree
// (BOT_WORKTREE_DIR): it stays the first project's, the others get <dataDir>/worktrees/<key>.
export function buildProjects(config: any, { dataDir, legacyWorktreeDir }: { dataDir: string; legacyWorktreeDir: string }) {
  const keys = assignKeys(config.projects);
  return config.projects.map((p: any, i: number) => ({
    key: keys[i],
    kind: p.kind ?? null,
    gitlabProjectId: p.gitlabProjectId,
    encodedId: /^\d+$/.test(p.gitlabProjectId) ? p.gitlabProjectId : encodeURIComponent(p.gitlabProjectId),
    repoPath: p.repoLocalPath,
    worktreeDir: i === 0 ? legacyWorktreeDir : join(dataDir, 'worktrees', keys[i]),
    reviewsDir: join(p.repoLocalPath, '.claude', 'reviews'),
    reviewCommand: p.reviewCommand,
    triageCommand: p.triageCommand,
    allowedTargetBranches: p.allowedTargetBranches,
    excludeAuthors: p.excludeAuthors,
  }));
}
