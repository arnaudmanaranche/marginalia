// Which of my branches get an own review before they have an MR (GLOSSARY.md, Own review): pushed
// by me lately, not the default or a protected branch, and with no open MR (a draft MR does not
// count: it is still mine alone). Pure, so it is tested on plain fixtures.

export const branchStateKey = (branch: string) => `branch:${branch}`;

/**
 * @param {{ branches: any[], me: { emails: string[], name: string | null }, openMrBranches: Set<string>,
 *   defaultBranch: string, now: number, staleDays: number }} input GitLab's branch list, newest first.
 */
export function planOwnBranches({ branches, me, openMrBranches, defaultBranch, now, staleDays }: { branches: any[]; me: { emails: string[]; name: string | null }; openMrBranches: Set<string>; defaultBranch: string; now: number; staleDays: number }) {
  const emails = new Set(me.emails.map((e) => e.toLowerCase()));
  const cutoff = now - staleDays * 24 * 60 * 60 * 1000;
  const mine = (commit: any) => emails.has(String(commit?.author_email ?? '').toLowerCase())
    || (me.name !== null && commit?.author_name === me.name);
  return branches.filter((b) => b.name !== defaultBranch
    && !b.protected
    && !b.default
    && !openMrBranches.has(b.name)
    && mine(b.commit)
    && new Date(b.commit?.committed_date ?? 0).getTime() >= cutoff);
}

// A branch as the review flow takes an MR: no iid, the default branch as its target, me as author.
/** @param {any} project @param {any} branch @param {{ defaultBranch: string, username: string, webBase: string }} ctx */
export function branchTarget(project: any, branch: any, { defaultBranch, username, webBase }: { defaultBranch: string; username: string; webBase: string }) {
  return {
    iid: null,
    branch: true,
    sha: branch.commit.id,
    title: `Branch ${branch.name}`,
    description: branch.commit.message ?? '',
    source_branch: branch.name,
    target_branch: defaultBranch,
    author: { username },
    web_url: branch.web_url ?? `${webBase}/-/tree/${encodeURIComponent(branch.name)}`,
    updated_at: branch.commit.committed_date,
    project,
  };
}
