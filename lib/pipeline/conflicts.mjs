// @ts-check
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileAsync } from '../exec.mjs';
import { commitEnv } from '../git-identity.mjs';
import { STAGE_FIX_TOOLS } from '../allowed-tools.mjs';
import { agentStage } from './agent-stage.mjs';
import { parseMergeTree } from './context-text.mjs';
import { TRIAGE_SYSTEM, conflictPrompt, parseConflict } from './triage-prompts.mjs';

// Commits are made as me (git-identity.mjs): they are pushed under my name.
const git = async (cwd, args) => execFileAsync('git', args, { cwd, ...(args[0] === 'commit' && { env: await commitEnv() }) }).then((r) => String(r.stdout).trim());
// What git writes in a file it could not merge.
const MARKER = /^(<{7}|>{7})( |$)|^={7}$/m;

// When my MR no longer merges into its target, the triage settles that first, like a reviewer
// would ask: the bot merges the target in (a merge, not a rebase, so the push stays a
// fast-forward), one agent settles the conflicted files, and the bot checks no marker is left
// before committing the merge. The fixes are then made on top of it. When the agent can't
// settle them, the merge is undone and the triage goes on without it.
/** @param {{ mr: any, run: any, context: string, settings: object | null }} input */
export async function settleConflicts({ mr, run, context, settings }) {
  const cwd = mr.project.worktreeDir;
  const target = mr.target_branch;
  await run.stage('conflicts');
  // Exit 1 is git's "it conflicts"; anything else is an error of its own.
  const out = await execFileAsync('git', ['merge-tree', '--write-tree', '--name-only', 'HEAD', `origin/${target}`], { cwd })
    .then(() => null, (err) => (err.code === 1 ? String(err.stdout) : Promise.reject(err)));
  if (out === null) {
    run.step(`No conflict with ${target}`, { stage: 'conflicts' });
    return null;
  }
  const files = parseMergeTree(out);
  run.step(`Merging ${target} in conflicts in ${files.length} file(s): ${files.join(', ')}`, { stage: 'conflicts' });
  await git(cwd, ['merge', '--no-ff', '--no-commit', `origin/${target}`]).catch(() => null);
  try {
    const done = await agentStage({ run, stage: 'conflicts', prompt: conflictPrompt({ context, target, files }), system: TRIAGE_SYSTEM, tools: STAGE_FIX_TOOLS, cwd, settings, parse: parseConflict });
    const left = [];
    for (const f of files) if (MARKER.test(await readFile(join(cwd, f), 'utf8').catch(() => ''))) left.push(f);
    if (left.length) throw new Error(`conflict markers are left in ${left.join(', ')}`);
    if (!done.settled) throw new Error(done.how);
    await git(cwd, ['add', '-A']);
    await git(cwd, ['commit', '-q', '-m', `Merge ${target} into ${mr.source_branch}, settling the conflicts`, '-m', done.how]);
    const commit = await git(cwd, ['rev-parse', 'HEAD']);
    run.step(`Committed the merge ${commit.slice(0, 8)}: ${done.how}`, { stage: 'conflicts' });
    return { files, commit, how: done.how, error: null };
  } catch (err) {
    await git(cwd, ['merge', '--abort']).catch(() => null);
    await git(cwd, ['clean', '-fdq', '-e', '.claude']);
    const error = String(err.message).slice(0, 300);
    run.step(`Not settled (${error}): the merge is undone, the fixes are made on the branch as it is`, { stage: 'conflicts' });
    await run.end('conflicts', 'failed');
    return { files, commit: null, how: null, error };
  }
}
