#!/usr/bin/env node
// The `marginalia` command: one entry point for setup, checks, running and the
// background service. Each subcommand imports its script lazily, so `--help` stays fast
// and a missing config only matters to the commands that read it.
import { PACKAGE_ROOT } from '../src/package-root.ts';
import '../src/node-check.ts';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Command } from 'commander';
import { updatePlan } from '../src/update-plan.ts';

const ROOT = PACKAGE_ROOT;
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const program = new Command('marginalia').description(pkg.description).version(pkg.version);
const done = (code) => { process.exitCode = code; };

program.command('init').description('interactive setup: GitLab, repos and commands, written to config.json')
  .action(async () => done(await (await import('../scripts/init.ts')).runInit()));

program.command('migrate').description('convert the current .env into config.json (single project; the .env is left as is)')
  .option('--force', 'overwrite an existing config.json')
  .action(async (o) => done((await import('../scripts/migrate.ts')).runMigrate({ force: o.force })));

program.command('doctor').description('read-only checks of the install, with how to fix each failure')
  .option('--dry-run <iid>', 'run the real review chain on one MR into a temp file')
  .option('--project <key>', 'project of the MR for --dry-run (default: the first)')
  .action(async (o) => {
    const argv = [...(o.dryRun ? ['--dry-run', o.dryRun] : []), ...(o.project ? ['--project', o.project] : [])];
    done(await (await import('../scripts/doctor.ts')).runDoctor(argv));
  });

program.command('start').description('run the poller and the studio in the foreground')
  .action(async () => { await import('../poll.ts'); });

const service = program.command('service').description('start the bot at login (launchd on macOS, systemd --user on Linux)');
for (const [action, text] of [['install', 'install and start the service'], ['uninstall', 'stop and remove the service'], ['status', 'tell whether the service is running']]) {
  service.command(action).description(text)
    .option('--dry-run', 'print what would be written and run, change nothing')
    .action(async (o) => done((await import('../scripts/service.ts')).runService(action, { dryRun: o.dryRun })));
}

program.command('update').description('install the latest published version')
  .action(() => {
    const plan = updatePlan({ isClone: existsSync(join(ROOT, '.git')), packageName: pkg.name });
    console.log(plan.message);
    if (!plan.run) return;
    done(spawnSync(plan.run[0], plan.run[1], { stdio: 'inherit' }).status ?? 1);
  });

program.command('sync').description('sync the team settings (needs a build that includes team sync)')
  .option('--dry-run', 'show what would change')
  .allowUnknownOption()
  .action(async (o) => {
    const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'team-sync.js');
    if (!existsSync(file)) { console.error('team sync is not available in this build'); return done(1); }
    done(await (await import(pathToFileURL(file).href)).default(o));
  });

await program.parseAsync();
