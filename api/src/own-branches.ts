import { gitlab } from './gitlab-api.ts';
import { GITLAB_BASE_URL } from './config.ts';
import { staleAfterDays } from './settings.ts';
import { branchStateKey, branchTarget, planOwnBranches } from './own-branches-plan.ts';

// The I/O half of own-branches-plan.ts: my branches without an MR, as review targets, each with
// whether its own review is current. Who I am (emails, name) and the default branch are read once.
let me: Promise<{ emails: string[]; name: string | null; username: string }> | null = null;
const whoAmI = () => (me ??= gitlab.currentUser().then((u: any) => ({
  emails: [u.email, u.commit_email, u.public_email].filter(Boolean),
  name: u.name ?? null,
  username: u.username,
})));
const defaults = new Map<string, Promise<any>>();
const projectInfo = (project: any) => {
  if (!defaults.has(project.key)) defaults.set(project.key, gitlab.getProject(project));
  return defaults.get(project.key)!;
};

/** @param {any} project @param {any[]} openMrs the open MRs the pass saw (drafts left out) @param {any} state */
export async function listOwnBranches(project: any, openMrs: any[], state: any) {
  const [user, info, branches] = await Promise.all([whoAmI(), projectInfo(project), gitlab.listBranches(project)]);
  const defaultBranch = info.default_branch;
  const planned = planOwnBranches({
    branches, me: user, defaultBranch, now: Date.now(), staleDays: staleAfterDays(),
    openMrBranches: new Set(openMrs.map((mr: any) => mr.source_branch)),
  });
  const webBase = info.web_url ?? `${GITLAB_BASE_URL}/${project.gitlabProjectId}`;
  return planned.map((b: any) => {
    const target = branchTarget(project, b, { defaultBranch, username: user.username, webBase });
    return { target, current: state[branchStateKey(b.name)] === target.sha };
  });
}
