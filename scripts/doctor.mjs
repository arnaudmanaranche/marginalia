// Read-only preflight: `marginalia doctor` (or `npm run doctor`), and
// `doctor --dry-run <iid> [--project <key>]` to run the real review chain on one MR
// and write the result to a temp file.
import '../lib/node-check.mjs';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { sandboxStatus, notifierAdvice } from '../lib/platform-support.mjs';

const run = promisify(execFile);

export async function runDoctor(argv = process.argv.slice(2)) {
  let failures = 0;
  const ok = (m) => console.log(`  ✓ ${m}`);
  const warnMsg = (m) => console.log(`  ! ${m}`);
  const bad = (m, fix) => { failures += 1; console.log(`  ✗ ${m}${fix ? `\n      -> ${fix}` : ''}`); };
  const step = async (name, fn) => {
    try { await fn(); } catch (err) { bad(`${name}: ${err.message.split('\n')[0]}${err.cause?.code ? ` (${err.cause.code})` : ''}`); }
  };

  console.log('marginalia doctor\n');
  process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
  // A dry run is a test of the chain, not usage, and the process exits before an event could be sent.
  process.env.MARGINALIA_TELEMETRY = 'off';
  let cfg;
  let projectsMod;
  try {
    cfg = await import('../lib/config.mjs');
    projectsMod = await import('../lib/projects.mjs');
  } catch (err) {
    console.log('Environment');
    bad(err.message.split('\n')[0], 'fix or remove that file, then `marginalia doctor` again (`marginalia init` rewrites it)');
    console.log(`\n${failures} problem(s) to fix.`);
    return 1;
  }
  const { PROJECTS, projectByKey } = projectsMod;

  console.log('Environment');
  Number(process.versions.node.split('.')[0]) >= 22 ? ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node}`, 'Node 22+ required (nvm use)');
  const configFile = join(cfg.DATA_DIR, 'config.json');
  if (cfg.FILE_CONFIG) ok(`Config: ${configFile}`);
  else if (existsSync(join(cfg.ROOT, '.env'))) ok(`Config: ${join(cfg.ROOT, '.env')} (single project; \`marginalia migrate\` converts it to config.json)`);
  else bad('No config.json or .env', 'marginalia init');
  const missing = cfg.missingConfig();
  missing.length ? bad(`Missing in the config: ${missing.join(', ')}`, 'marginalia init') : ok('Required config values present');
  existsSync(join(cfg.ROOT, 'studio', 'dist')) ? ok('Studio built') : warnMsg('Studio not built (http://localhost shows 503): npm run setup');
  const sandbox = sandboxStatus({ platform: process.platform, sandboxEnabled: cfg.CLAUDE_SANDBOX !== 'false', container: process.env.MARGINALIA_CONTAINER === '1' });
  sandbox.level === 'ok' ? ok(sandbox.message) : warnMsg(sandbox.message);

  console.log('\nClaude');
  await step('claude CLI', async () => {
    const { stdout } = await run(cfg.CLAUDE_BIN, ['--version']);
    ok(`${cfg.CLAUDE_BIN} ${stdout.trim()}`);
  });
  if (process.env.ANTHROPIC_API_KEY) warnMsg('ANTHROPIC_API_KEY is set: the bot strips it for its runs, so you must be logged into claude.ai (`claude` then /login)');

  console.log('\nGitLab');
  if (!missing.length) {
    const { gitlabRequest } = await import('../lib/gitlab.mjs');
    await step('GitLab token', async () => {
      const me = await gitlabRequest('/user');
      me.username === cfg.GITLAB_USERNAME ? ok(`Token belongs to ${me.username}`) : bad(`Token belongs to "${me.username}" but GITLAB_USERNAME is "${cfg.GITLAB_USERNAME}"`);
    });
    for (const project of PROJECTS) {
      await step(`GitLab project ${project.key}`, async () => {
        const p = await gitlabRequest(`/projects/${project.encodedId}`);
        ok(`[${project.key}] ${p.path_with_namespace} reachable`);
      });
    }
  }

  const dirsOf = (project) => [join(project.repoPath, '.claude'), join(homedir(), '.claude')];
  const findCommand = (project, cmd) => dirsOf(project).some((d) => existsSync(join(d, 'commands', `${cmd.replace(/^\//, '')}.md`)) || existsSync(join(d, 'skills', cmd.replace(/^\//, ''), 'SKILL.md')));
  for (const project of PROJECTS) {
    console.log(`\nRepository and commands [${project.key}]`);
    await step(`${project.key} repository`, async () => {
      await run('git', ['rev-parse', '--git-dir'], { cwd: project.repoPath });
      ok(`${project.repoPath} is a git repository`);
      const { stdout } = await run('git', ['remote', 'get-url', 'origin'], { cwd: project.repoPath });
      ok(`origin = ${stdout.trim()}`);
    });
    await step(`${project.key} worktrees`, async () => {
      // In the container image: a checkout that the host also uses has worktrees we cannot see (see lib/worktree-guard.mjs).
      const { containerRepoProblem } = await import('../lib/worktree.mjs');
      const problem = await containerRepoProblem(project.repoPath);
      if (problem) bad(problem);
    });
    for (const [label, cmd] of [['review command', project.reviewCommand], ['triage command', project.triageCommand]]) {
      if (!cmd) { label === 'triage command' ? warnMsg('triage command empty: your own MRs are ignored') : bad('review command is empty'); continue; }
      findCommand(project, cmd) ? ok(`${label} ${cmd} found`) : bad(`${label} ${cmd} not found in <repo>/.claude or ~/.claude`, 'copy one from examples/commands or fix the name (plugin commands are not detected here: use --dry-run)');
    }
  }

  console.log('\nTeam');
  await step('team', async () => {
    const { loadTeam, readMarker, teamRepoUrl } = await import('../lib/team-sync.mjs');
    const { commitsBehind } = await import('../lib/team-git.mjs');
    const { teamChecks } = await import('../lib/team-doctor.mjs');
    const { mergeTeam } = await import('../lib/team-merge.mjs');
    const { RUNNING_VERSION } = await import('../lib/config-team.mjs');
    const loaded = await loadTeam(cfg.DATA_DIR, RUNNING_VERSION);
    const dev = { projects: PROJECTS.map((p) => ({ gitlabProjectId: p.gitlabProjectId })) };
    for (const c of teamChecks({
      url: teamRepoUrl({ config: cfg.FILE_CONFIG }),
      marker: await readMarker(cfg.DATA_DIR),
      loaded,
      behind: loaded.present ? await commitsBehind(join(cfg.DATA_DIR, 'team')) : null,
      unmapped: loaded.ok ? mergeTeam(dev, loaded.team).unmapped : [],
      now: Date.now(),
    })) {
      if (c.level === 'ok') ok(c.message);
      else if (c.level === 'warn') warnMsg(`${c.message}${c.fix ? ` -> ${c.fix}` : ''}`);
      else bad(c.message, c.fix);
    }
  });

  const notifier = process.env.MARGINALIA_CONTAINER === '1' ? null : notifierAdvice(process.platform);
  if (notifier) {
    console.log(`\nOptional (${process.platform})`);
    await run('which', [notifier.bin]).then(() => ok(notifier.bin), () => warnMsg(`${notifier.bin} missing: ${notifier.hint}`));
  }

  const dryIdx = argv.indexOf('--dry-run');
  if (dryIdx !== -1 && !failures) {
    const iid = argv[dryIdx + 1];
    const keyIdx = argv.indexOf('--project');
    const project = keyIdx === -1 ? PROJECTS[0] : projectByKey(argv[keyIdx + 1]);
    if (!project) bad(`No project "${argv[keyIdx + 1]}"`, `known: ${PROJECTS.map((p) => p.key).join(', ')}`);
    console.log(`\nDry run on MR !${iid} [${project?.key}]`);
    const { gitlabRequest } = await import('../lib/gitlab.mjs');
    const { ensureBotWorktree } = await import('../lib/worktree.mjs');
    const { runReview } = await import('../lib/claude-runner.mjs');
    await step('dry run', async () => {
      const mr = { ...(await gitlabRequest(`/projects/${project.encodedId}/merge_requests/${iid}`)), project };
      await ensureBotWorktree(project);
      const out = join(tmpdir(), `marginalia-dry-run-${iid}.md`);
      const outcome = await runReview(mr, out);
      outcome === 'reviewed' ? ok(`Report written to ${out} (see the log line above for which source was used)`) : bad(`Skipped: ${outcome}`);
    });
  }

  console.log(failures ? `\n${failures} problem(s) to fix.` : '\nAll good.');
  return failures ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await runDoctor());
