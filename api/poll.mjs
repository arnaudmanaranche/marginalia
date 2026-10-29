import './src/node-check.mjs';
import { mkdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { ROOT, ensureDataDir } from './src/config.mjs';
import { PROJECTS } from './src/projects.mjs';
import { loadSettings, pollIntervalMs } from './src/settings.mjs';
import { startStudio } from './src/http/server.mjs';
import { isFancyTerminal, c } from './src/log.mjs';
import { logger } from './src/logger.mjs';
import { RETRY_AFTER_MS, failureKind } from './src/failure-kind.mjs';
import { status, statusSink, writeStatus } from './src/status.mjs';
import { notify } from './src/notify.mjs';
import { ensureBotWorktree } from './src/worktree.mjs';
import { passOver } from './src/poll-pass.mjs';
import { passDeps } from './src/poll-pass-deps.mjs';

// A failure that passes by itself (GitLab unreachable, Claude overloaded) brings the next poll closer.
let retrySoon = false;

// One project after the other: a project's bot worktree is never shared by two runs.
async function poll() {
  logger.info('Polling open MRs...');
  status.phase = 'polling';
  await writeStatus();
  const failures = [];
  for (const project of PROJECTS) {
    try {
      if ((await passOver(project, passDeps, statusSink)).retrySoon) retrySoon = true;
    } catch (err) {
      logger.error({ project: project.key, err }, 'Poll failed');
      failures.push(`${project.key}: ${err.message}`);
    }
  }
  if (failures.length) throw new Error(failures.join('; '));
  logger.info(`Poll done. Next one in ${loadSettings().pollIntervalMinutes} minute(s).`);
}

const BANNER = [
  "                                _                _  _",
  " _ __ ___    __ _  _ __   __ _ (_) _ __    __ _ | |(_)  __ _",
  "| '_ ` _ \\  / _` || '__| / _` || || '_ \\  / _` || || | / _` |",
  "| | | | | || (_| || |   | (_| || || | | || (_| || || || (_| |",
  "|_| |_| |_| \\__,_||_|    \\__, ||_||_| |_| \\__,_||_||_| \\__,_|",
  "                         |___/",
].join('\n');

function printBanner() {
  if (!isFancyTerminal) return;
  console.log(`\n${c.cyan}${c.bold}${BANNER}${c.reset}\n`);
}

let pollTimer = null;
let isPolling = false;

// The next poll is only scheduled once this one is over: a review can take
// longer than the poll interval, and two polls must never share the bot
// worktree at the same time.
async function runPoll() {
  if (isPolling) {
    logger.info('A poll is already running, ignoring this request.');
    return;
  }
  clearTimeout(pollTimer);
  isPolling = true;
  try {
    await poll();
    status.phase = 'idle';
    status.lastPoll = { at: new Date().toISOString(), ok: true, error: null };
  } catch (err) {
    logger.error({ err }, 'Poll failed');
    const failure = failureKind(err.message);
    if (failure.transient) retrySoon = true;
    // Only notify on the ok -> error transition, not on every failed poll, nor for a passing outage.
    else if (status.lastPoll?.ok !== false) notify('Marginalia error', err.message);
    status.phase = 'error';
    status.lastPoll = { at: new Date().toISOString(), ok: false, error: err.message };
  } finally {
    isPolling = false;
    status.current = null;
    scheduleNextPoll(Date.now());
    await writeStatus();
  }
}

// The next poll is due `interval` after the previous one *finished* (`from`), sooner after a failure
// that passes by itself.
function scheduleNextPoll(from) {
  const interval = retrySoon ? Math.min(pollIntervalMs(), RETRY_AFTER_MS) : pollIntervalMs();
  retrySoon = false;
  const delay = Math.max(from + interval - Date.now(), 1000);
  clearTimeout(pollTimer);
  status.nextPollAt = new Date(Date.now() + delay).toISOString();
  pollTimer = setTimeout(runPoll, delay);
}

// settings.json changes (from the studio): re-arm the pending timer so the
// new interval applies right away instead of after the next poll. While a
// poll is running, its own finally block reads the fresh value.
let settingsDebounce = null;
function watchSettings() {
  try {
    watch(ROOT, (_event, name) => {
      if (name !== 'settings.json') return;
      clearTimeout(settingsDebounce);
      settingsDebounce = setTimeout(() => {
        if (isPolling || !status.lastPoll) return;
        scheduleNextPoll(new Date(status.lastPoll.at).getTime());
        logger.info(`Poll interval is now ${loadSettings().pollIntervalMinutes} minute(s).`);
        writeStatus();
      }, 200);
    });
  } catch (err) {
    logger.error({ err }, 'Could not watch settings.json');
  }
}

async function shutdown() {
  clearTimeout(pollTimer);
  status.phase = 'stopped';
  status.current = null;
  status.nextPollAt = null;
  await writeStatus();
  process.exit(0);
}

async function main() {
  printBanner();
  await writeStatus();
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  ensureDataDir();
  for (const project of PROJECTS) await mkdir(project.reviewsDir, { recursive: true });
  startStudio();
  watchSettings();
  for (const project of PROJECTS) await ensureBotWorktree(project);
  // `kill -USR1 <pid>` (the menu bar's "Poll now") triggers a poll right away.
  process.on('SIGUSR1', runPoll);
  await runPoll();
}

main();
