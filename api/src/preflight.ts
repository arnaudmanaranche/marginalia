import { gitlab } from './gitlab-api.ts';
import { CLAUDE_BIN } from './config.ts';
import { execFileAsync } from './exec.ts';
import { jiraCanRead, jiraEnabled, jiraKeyOf } from './jira.ts';
import { runEnv } from './run-settings.ts';
import { blockedError, branchCheck, checkLine, claudeCheck, gitlabCheck, jiraCheck, pushCheck } from './preflight-checks.ts';

const PROBE_TIMEOUT_MS = 20_000;
const message = (err: any) => String(err?.stderr || err?.message || err).trim();
const probe = (bin: string, args: string[], opts?: any) => execFileAsync(bin, args, { timeout: PROBE_TIMEOUT_MS, ...opts })
  .then((r) => ({ stdout: String(r.stdout), error: null }), (err) => ({ stdout: String(err.stdout ?? ''), error: message(err) }));

// Before a run pays for any agent, the bot checks in a few seconds that what the run will need
// answers: Claude logged in, GitLab reading the project, origin serving the MR's head, and for
// a triage, push access for its fixes. Each answer is a step of the run; one that would stop the
// run half way stops it here instead, with what to do. The ticket is checked too, but a run
// without it goes on.
/** @param {any} mr @param {{ kind: 'review' | 'triage', run: any }} opts */
export async function preflight(mr: any, { kind, run }: any) {
  await run.stage('preflight');
  const { repoPath } = mr.project;
  const key = jiraKeyOf(mr);
  const checks = await Promise.all([
    probe(CLAUDE_BIN, ['auth', 'status'], { env: runEnv() }).then(claudeCheck),
    gitlab.getProject(mr.project).then((project: any) => gitlabCheck({ project }), (err: any) => gitlabCheck({ error: message(err) })),
    probe('git', ['ls-remote', 'origin', `refs/merge-requests/${mr.iid}/head`], { cwd: repoPath }).then((r) => branchCheck({ ...r, iid: mr.iid })),
    ...(kind === 'triage'
      ? [probe('git', ['push', '--dry-run', '--no-verify', '--porcelain', 'origin', `HEAD:refs/heads/${mr.source_branch}`], { cwd: repoPath }).then((r) => pushCheck({ ...r, branch: mr.source_branch }))]
      : []),
    key && jiraEnabled
      ? jiraCanRead(key).then(() => jiraCheck({ key, enabled: true }), (err) => jiraCheck({ key, enabled: true, error: message(err) }))
      : Promise.resolve(jiraCheck({ key, enabled: jiraEnabled })),
  ]);
  for (const c of checks) run.step(checkLine(c), { stage: 'preflight' });
  const blocked = blockedError(checks);
  if (blocked) throw new Error(blocked);
  return checks;
}
