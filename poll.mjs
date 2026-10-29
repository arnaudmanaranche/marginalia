import './lib/node-check.mjs';
import { mkdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { GITLAB_USERNAME, ROOT, ensureDataDir } from './lib/config.mjs';
import { PROJECTS } from './lib/projects.mjs';
import { allowedTargets, loadSettings, pollIntervalMs } from './lib/settings.mjs';
import { startStudio } from './studio/server.mjs';
import { isFancyTerminal, c, log, logError } from './lib/log.mjs';
import { logger } from './lib/logger.mjs';
import { trackFailure } from './lib/telemetry.mjs';
import { RETRY_AFTER_MS, failureKind, needsDoctor } from './lib/failure-kind.mjs';
import { startDoctor } from './lib/doctor.mjs';
import { loadState, saveState } from './lib/state.mjs';
import { status, writeStatus, setMrStatus, sameMr } from './lib/status.mjs';
import { notify } from './lib/notify.mjs';
import { listOpenMergeRequests, reviewFileCoversLastPush, latestPeerCommentAt } from './lib/gitlab.mjs';
import { fetchReviewStates } from './lib/mr-state.mjs';
import { jiraPriorityOf } from './lib/jira.mjs';
import { reviewOutputPath, mrCommentsOutputPath, mtimeOrNull } from './lib/paths.mjs';
import { ensureBotWorktree } from './lib/worktree.mjs';
import { runReview, runMrComments } from './lib/claude-runner.mjs';
import { isStaged } from './lib/pipeline/staged.mjs';
import { planMergeRequests, needsTriage, triageSignal, recordBelow, pruneState } from './lib/poll-plan.mjs';
import { reviewEntry, commentsEntry } from './lib/poll-status.mjs';

// Marks the bot busy on one MR while `work` runs, then back to polling.
async function whileReviewing(mr, work) {
  status.phase = 'reviewing';
  status.current = { project: mr.project.key, iid: mr.iid, title: mr.title, web_url: mr.web_url, startedAt: new Date().toISOString() };
  await setMrStatus(mr, { status: 'reviewing' });
  try {
    await work();
  } finally {
    status.phase = 'polling';
    status.current = null;
    await writeStatus();
  }
}

// A failure that passes by itself (GitLab unreachable, Claude overloaded) brings the next poll
// closer and raises no alarm; any other one is notified and handed to the doctor, which explains it
// in the studio. Either way the MR is tried again next poll.
let retrySoon = false;
async function failed(mr, label, err) {
  const failure = failureKind(err.message);
  await setMrStatus(mr, { status: 'failed', error: err.message, failure });
  if (failure.transient) retrySoon = true;
  else notify(`${label} failed: ${failure.title}`, `!${mr.iid} ${mr.title}`);
  if (needsDoctor(failure) && err.run) {
    void startDoctor({ project: mr.project, fileSlug: err.run.fileSlug, runId: err.run.id, auto: true })
      .catch((e) => logger.warn({ err: e }, 'Could not start the doctor'));
  }
}

// Not recorded in state on a skip: the next poll retries it, once the branch has
// been switched away from in the other worktree.
const skipped = (mr) => setMrStatus(mr, { status: 'skipped', error: `Branch "${mr.source_branch}" is checked out in another worktree.` });

async function reviewOne(mr, plan, state) {
  // First time the bot ever sees this MR: if a review file already sits there
  // (written by hand via /code-review, or by a previous run of this bot before
  // state.json existed) and is newer than the last push, trust it and don't
  // redo the work. A file older than the last push predates some commits, so
  // it falls through to a real review.
  if (state[mr.iid] === undefined && (await reviewFileCoversLastPush(mr))) {
    log(mr, `A review file newer than the last push already exists at ${reviewOutputPath(mr)}, assuming it covers this commit. Skipping.`);
    state[mr.iid] = mr.sha;
    recordBelow(state, mr, plan.parentOf(mr));
    await saveState(mr.project, state);
    await setMrStatus(mr, { status: 'up_to_date' });
    return;
  }
  await whileReviewing(mr, async () => {
    try {
      const info = plan.stackInfo(mr);
      const outcome = await runReview(mr, reviewOutputPath(mr), info && { stacks: plan.stacks, info });
      if (outcome !== 'reviewed') return skipped(mr);
      state[mr.iid] = mr.sha;
      recordBelow(state, mr, plan.parentOf(mr));
      await saveState(mr.project, state);
      await setMrStatus(mr, { status: 'up_to_date', reviewedAt: new Date().toISOString() });
      notify('Review ready', `!${mr.iid} ${mr.title}`, reviewOutputPath(mr));
    } catch (err) {
      logError(mr, 'Review failed', err);
      trackFailure({ mr, kind: 'review', command: mr.project.reviewCommand, error: err });
      await failed(mr, 'Review', err);
    }
  });
}

async function triageOne(mr, signal, state) {
  await whileReviewing(mr, async () => {
    try {
      const outcome = await runMrComments(mr);
      if (outcome !== 'reviewed') return skipped(mr);
      state.mineComments[mr.iid] = signal;
      await saveState(mr.project, state);
      await setMrStatus(mr, { status: 'up_to_date', reviewedAt: new Date().toISOString() });
      notify('Comments triaged', `!${mr.iid} ${mr.title}`, mrCommentsOutputPath(mr));
    } catch (err) {
      logError(mr, 'Comment triage failed', err);
      trackFailure({ mr, kind: 'triage', command: mr.project.triageCommand, error: err });
      await failed(mr, 'Comment triage', err);
    }
  });
}

// One project after the other: a project's bot worktree is never shared by two runs.
async function poll() {
  logger.info('Polling open MRs...');
  status.phase = 'polling';
  await writeStatus();
  const failures = [];
  for (const project of PROJECTS) {
    try {
      await pollProject(project);
    } catch (err) {
      logger.error({ project: project.key, err }, 'Poll failed');
      failures.push(`${project.key}: ${err.message}`);
    }
  }
  if (failures.length) throw new Error(failures.join('; '));
  logger.info(`Poll done. Next one in ${loadSettings().pollIntervalMinutes} minute(s).`);
}

async function pollProject(project) {
  const state = await loadState(project);
  const plan = planMergeRequests({
    openMrs: await listOpenMergeRequests(project),
    state,
    allowedTargets: allowedTargets(project),
    username: GITLAB_USERNAME,
    triageEnabled: Boolean(project.triageCommand),
  });
  const { reviewMrs, myMrs } = plan;

  const toReview = reviewMrs.filter((mr) => !plan.isCurrent(mr));
  const peerCommentAts = await Promise.all(myMrs.map((mr) => latestPeerCommentAt(mr)));
  // GitLab's has_conflicts: the staged triage merges the target in and settles them.
  const settlesConflicts = isStaged(project.triageCommand ?? '');
  const myMrsWithSignal = myMrs.map((mr, i) => ({ mr, signal: triageSignal(peerCommentAts[i], settlesConflicts && mr.has_conflicts ? mr.sha : null) }));
  const toTriage = myMrsWithSignal.filter(({ mr, signal }) => needsTriage(state, mr, signal));

  // The review/report file's mtime doubles as "last reviewed at", so files
  // written by hand or before this field existed get a date too.
  const reviewedAts = await Promise.all(reviewMrs.map((mr) => mtimeOrNull(reviewOutputPath(mr))));
  const triagedAts = await Promise.all(myMrs.map((mr) => mtimeOrNull(mrCommentsOutputPath(mr))));
  const jiras = await Promise.all(reviewMrs.map((mr) => jiraPriorityOf(mr)));
  // Where each MR really stands for me, read from GitLab. One that cannot be read keeps what it had.
  const states = await fetchReviewStates(project, [...reviewMrs, ...myMrs]);
  const previous = status.mrs.filter((m) => m.project === project.key);
  const stateOf = (mr) => states.get(mr.iid) ?? previous.find((m) => sameMr(m, mr))?.myState ?? null;
  const entries = [
    ...reviewMrs.map((mr, i) => reviewEntry(mr, { plan, reviewPath: reviewOutputPath(mr), reviewedAtMs: reviewedAts[i], jira: jiras[i], myState: stateOf(mr) })),
    ...myMrsWithSignal.map(({ mr, signal }, i) => commentsEntry(mr, {
      // No peer comment and no conflict counts as "up to date": there is nothing to triage yet.
      pending: needsTriage(state, mr, signal),
      reviewPath: mrCommentsOutputPath(mr),
      reviewedAtMs: triagedAts[i],
      myState: stateOf(mr),
    })),
  ];
  status.mrs = [...status.mrs.filter((m) => m.project !== project.key), ...entries];
  await writeStatus();
  logger.info({ project: project.key }, `${reviewMrs.length} MR(s) to review, ${myMrs.length} of my own — ${toReview.length} need a review, ${toTriage.length} need comment triage.`);

  for (const mr of toReview) await reviewOne(mr, plan, state);
  for (const { mr, signal } of toTriage) await triageOne(mr, signal, state);

  pruneState(state, new Set(reviewMrs.map((mr) => String(mr.iid))), new Set(myMrs.map((mr) => String(mr.iid))));
  await saveState(project, state);
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
