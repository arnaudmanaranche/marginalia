import './src/node-check.ts';
import { mkdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { ROOT, ensureDataDir } from './src/config.ts';
import { PROJECTS } from './src/projects.ts';
import { loadSettings, pollIntervalMs } from './src/settings.ts';
import { startStudio } from './src/http/server.ts';
import { isFancyTerminal, c } from './src/log.ts';
import { logger } from './src/logger.ts';
import { RETRY_AFTER_MS, failureKind } from './src/failure-kind.ts';
import { settlePhase, status, statusSink, writeStatus } from './src/status.ts';
import { notify } from './src/notify.ts';
import { ensureBotWorktree } from './src/worktree.ts';
import { passOver } from './src/poll-pass.ts';
import { passDeps } from './src/poll-pass-deps.ts';
import { botQueue } from './src/bot-queue.ts';
import { forget } from './src/rerun.ts';
import { todayBudget } from './src/budget-today.ts';
import { heldReason } from './src/budget.ts';
import { loadState, saveState } from './src/state.ts';
import { closeInterruptedRuns } from './src/run-recover.ts';
import { startWebhookIfConfigured } from './src/webhook-intake.ts';
import { intakePass } from './src/mention-pass.ts';
import { failureTitleOf, mentionDeps } from './src/mention-deps.ts';

// A failure that passes by itself (GitLab unreachable, Claude overloaded) brings the next poll closer.
let retrySoon = false;

// One project's pass, then its mentions: after the pass, so a mention is answered with the review
// the pass just made available. Runs in the project's lane of the queue: a project's bot worktree
// is never shared by two runs, two projects run side by side.
async function pollProject(project: any) {
  if ((await passOver(project, passDeps, statusSink)).retrySoon) retrySoon = true;
  await intakePass(project, mentionDeps, failureTitleOf);
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

let pollTimer: ReturnType<typeof setTimeout> | undefined;
let isPolling = false;

const projectOf = (key: string) => {
  const project = PROJECTS.find((p: any) => p.key === key);
  if (!project) throw new Error(`No project "${key}" any more`);
  return project;
};

// A poll task of one project; one with no project (queued before lanes existed) polls them all.
botQueue.handle('poll', async ({ project: key = null } = {}) => {
  if (key !== null) return pollProject(projectOf(key));
  for (const project of PROJECTS) await pollProject(project);
});

// "Review again" (rerun.ts): forget the MR's recorded head, then pass over its project alone.
botQueue.handle('rerun', async (target) => {
  const project = projectOf(target.project);
  await saveState(project, forget(await loadState(project), target));
  if ((await passOver(project, passDeps, statusSink, target)).retrySoon) retrySoon = true;
});

// Today's spend, kept in status.json for the menu bar, and told once a day when the budget runs out:
// the polls go on (they cost nothing), their work waits.
let budgetToldFor: string | null = null;
function followBudget() {
  let budget;
  try {
    budget = todayBudget();
  } catch (err) {
    return logger.warn({ err }, 'Could not read today\'s budget');
  }
  status.budget = { spentUsd: budget.spentUsd, limitUsd: budget.limitUsd, over: budget.over };
  if (!budget.over || budgetToldFor === budget.since) return;
  budgetToldFor = budget.since;
  logger.warn(heldReason(budget));
  notify('Marginalia: daily budget reached', heldReason(budget));
}

// The phase follows the queue: what runs, and whether the last poll failed.
botQueue.onChange(() => {
  followBudget();
  settlePhase(botQueue.running);
  void writeStatus();
});

// A poll is one task per project, behind what a person asked for. A project's poll asked while one
// waits joins it; asked while one runs, it waits behind it. The next poll is only scheduled once
// every project's is over: a review can take longer than the poll interval.
async function runPoll() {
  clearTimeout(pollTimer);
  isPolling = true;
  logger.info(`Polling the open MRs of ${PROJECTS.length} project(s)...`);
  try {
    const results = await Promise.allSettled(PROJECTS.map((p: any) => botQueue.enqueue({
      kind: 'poll', project: p.key, label: `Poll ${p.key}`, payload: { project: p.key }, dedupe: `poll:${p.key}`,
    })));
    const failures = results.flatMap((r, i) => (r.status === 'rejected' ? [`${PROJECTS[i].key}: ${(r.reason as Error)?.message ?? r.reason}`] : []));
    if (failures.length) throw new Error(failures.join('; '));
    status.lastPoll = { at: new Date().toISOString(), ok: true, error: null };
    logger.info(`Poll done. Next one in ${loadSettings().pollIntervalMinutes} minute(s).`);
  } catch (err) {
    logger.error({ err }, 'Poll failed');
    const failure = failureKind(err.message);
    if (failure.transient) retrySoon = true;
    // Only notify on the ok -> error transition, not on every failed poll, nor for a passing outage.
    else if (status.lastPoll?.ok !== false) notify('Marginalia error', err.message);
    status.lastPoll = { at: new Date().toISOString(), ok: false, error: err.message };
  } finally {
    isPolling = false;
    followBudget();
    settlePhase(botQueue.running);
    scheduleNextPoll(Date.now());
    await writeStatus();
  }
}

// The next poll is due `interval` after the previous one *finished* (`from`), sooner after a failure
// that passes by itself.
function scheduleNextPoll(from: any) {
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
let settingsDebounce: ReturnType<typeof setTimeout> | undefined;
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
  status.running = [];
  status.nextPollAt = null;
  await writeStatus();
  process.exit(0);
}

async function main() {
  printBanner();
  followBudget();
  await writeStatus();
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  ensureDataDir();
  for (const project of PROJECTS) await mkdir(project.reviewsDir, { recursive: true });
  await closeInterruptedRuns().catch((err) => logger.warn({ err }, 'Could not close interrupted runs'));
  startStudio();
  startWebhookIfConfigured();
  watchSettings();
  for (const project of PROJECTS) await ensureBotWorktree(project);
  // `kill -USR1 <pid>` (the menu bar's "Poll now") triggers a poll right away.
  process.on('SIGUSR1', runPoll);
  botQueue.start();
  await runPoll();
}

main();
