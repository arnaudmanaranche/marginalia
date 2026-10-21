import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrate } from '../scripts/migrate.mjs';
import { runService } from '../scripts/service.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'marginalia-test-'));
const ENV = 'GITLAB_BASE_URL=https://git.example.com\nGITLAB_PROJECT_ID=g/p\nGITLAB_TOKEN=glpat-1\nGITLAB_USERNAME=me\nREPO_LOCAL_PATH=/code/p\n';
const collect = () => { const lines = []; return { lines, log: (m) => lines.push(m) }; };

test('migrate writes config.json (private) and leaves the .env as it is', () => {
  const dataDir = tmp();
  const envFile = join(dataDir, '.env');
  writeFileSync(envFile, ENV);
  const out = collect();
  assert.equal(runMigrate({ dataDir, envFile, log: out.log }), 0);
  const written = JSON.parse(readFileSync(join(dataDir, 'config.json'), 'utf8'));
  assert.equal(written.projects[0].gitlabProjectId, 'g/p');
  assert.equal(statSync(join(dataDir, 'config.json')).mode & 0o077, 0);
  assert.equal(readFileSync(envFile, 'utf8'), ENV);
  assert.match(out.lines.join('\n'), /\.env was left untouched/);
});

test('migrate refuses to overwrite a config.json without --force', () => {
  const dataDir = tmp();
  const envFile = join(dataDir, '.env');
  writeFileSync(envFile, ENV);
  writeFileSync(join(dataDir, 'config.json'), '{"keep":true}');
  const out = collect();
  assert.equal(runMigrate({ dataDir, envFile, log: out.log }), 1);
  assert.equal(readFileSync(join(dataDir, 'config.json'), 'utf8'), '{"keep":true}');
  assert.match(out.lines[0], /--force/);
  assert.equal(runMigrate({ dataDir, envFile, force: true, log: () => {} }), 0);
  assert.equal(JSON.parse(readFileSync(join(dataDir, 'config.json'), 'utf8')).projects.length, 1);
});

test('migrate says what is missing instead of writing a broken file', () => {
  const dataDir = tmp();
  const envFile = join(dataDir, '.env');
  writeFileSync(envFile, 'GITLAB_BASE_URL=https://x\n');
  const out = collect();
  assert.equal(runMigrate({ dataDir, envFile, log: out.log }), 1);
  assert.ok(!existsSync(join(dataDir, 'config.json')));
  assert.match(out.lines[0], /gitlabToken/);
});

test('migrate with no .env at all fails with a hint', () => {
  const out = collect();
  assert.equal(runMigrate({ dataDir: tmp(), envFile: null, log: out.log }), 1);
  assert.match(out.lines[0], /nothing to migrate/);
});

test('service install on Linux, dry run into a folder: writes the unit there, runs nothing', () => {
  const dir = tmp();
  const out = collect();
  assert.equal(runService('install', { platform: 'linux', dryRun: true, dir, log: out.log, warn: () => {}, env: { HOME: dir, PATH: '/usr/bin' } }), 0);
  const unit = readFileSync(join(dir, 'marginalia.service'), 'utf8');
  assert.match(unit, /ExecStart=".*node" ".*poll\.mjs"/);
  const text = out.lines.join('\n');
  assert.match(text, /\[dry-run\] systemctl --user daemon-reload/);
  assert.match(text, /\[dry-run\] systemctl --user enable --now marginalia\.service/);
});

test('service install on Linux, plain dry run: prints the unit and writes nothing', () => {
  const home = tmp();
  const out = collect();
  assert.equal(runService('install', { platform: 'linux', dryRun: true, log: out.log, warn: () => {}, env: { HOME: home, PATH: '/usr/bin' } }), 0);
  assert.match(out.lines.join('\n'), /\[dry-run\] write .*\.config\/systemd\/user\/marginalia\.service/);
  assert.ok(!existsSync(join(home, '.config')));
});

test('service install on macOS, dry run: bootstraps the plist written to the folder', () => {
  const dir = tmp();
  const out = collect();
  assert.equal(runService('install', { platform: 'darwin', dryRun: true, dir, log: out.log, warn: () => {}, env: { HOME: dir, PATH: '/usr/bin' } }), 0);
  assert.match(readFileSync(join(dir, 'com.marginalia.bot.plist'), 'utf8'), /<key>Label<\/key><string>com\.marginalia\.bot<\/string>/);
  assert.match(out.lines.join('\n'), /\[dry-run\] launchctl bootstrap gui\/\d+ .*com\.marginalia\.bot\.plist/);
});

test('service uninstall and status in dry run do not fail', () => {
  const dir = tmp();
  const opts = { platform: 'linux', dryRun: true, dir, log: () => {}, warn: () => {}, env: { HOME: dir } };
  assert.equal(runService('status', opts), 0);
  assert.equal(runService('uninstall', opts), 0);
});

test('on other platforms the service prints the pm2 instructions', () => {
  const out = collect();
  assert.equal(runService('install', { platform: 'win32', log: out.log }), 1);
  assert.match(out.lines[0], /pm2 start/);
});
