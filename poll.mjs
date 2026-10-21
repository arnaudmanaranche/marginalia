import './lib/node-check.mjs';
import { mkdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { GITLAB_USERNAME, ROOT, ensureDataDir } from './lib/config.mjs';
import { PROJECTS } from './lib/projects.mjs';
import { allowedTargets, loadSettings, pollIntervalMs } from './lib/settings.mjs';
import { startStudio } from './studio/server.mjs';
import { isFancyTerminal, c, timestamp, log, mrTag } from './lib/log.mjs';
import { loadState, saveState } from './lib/state.mjs';
import { status, writeStatus, setMrStatus, sameMr } from './lib/status.mjs';
import { notify } from './lib/notify.mjs';
import { listOpenMergeRequests, reviewFileCoversLastPush, latestPeerCommentAt } from './lib/gitlab.mjs';
import { fetchReviewStates } from './lib/mr-state.mjs';
import { jiraPriorityOf } from './lib/jira.mjs';
import { reviewOutputPath, mrCommentsOutputPath, mtimeOrNull } from './lib/paths.mjs';
import { ensureBotWorktree } from './lib/worktree.mjs';
import { runReview, runMrComments } from './lib/claude-runner.mjs';
import { planMergeRequests, needsTriage, recordBelow, pruneState } from './lib/poll-plan.mjs';
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
      console.error(`${timestamp()} ${c.red}${mrTag(mr)} Review failed:${c.reset}`, err);
      await setMrStatus(mr, { status: 'failed', error: err.message });
      notify('Review failed', `!${mr.iid} ${mr.title}`);
    }
  });
}

async function triageOne(mr, peerCommentAt, state) {
  await whileReviewing(mr, async () => {
    try {
      const outcome = await runMrComments(mr);
      if (outcome !== 'reviewed') return skipped(mr);
      state.mineComments[mr.iid] = peerCommentAt;
      await saveState(mr.project, state);
      await setMrStatus(mr, { status: 'up_to_date', reviewedAt: new Date().toISOString() });
      notify('Comments triaged', `!${mr.iid} ${mr.title}`, mrCommentsOutputPath(mr));
    } catch (err) {
      console.error(`${timestamp()} ${c.red}${mrTag(mr)} Comment triage failed:${c.reset}`, err);
      await setMrStatus(mr, { status: 'failed', error: err.message });
      notify('Comment triage failed', `!${mr.iid} ${mr.title}`);
    }
  });
}

// One project after the other: a project's bot worktree is never shared by two runs.
async function poll() {
  console.log(`${timestamp()} ${c.bold}${c.cyan}Polling open MRs...${c.reset}`);
  status.phase = 'polling';
  await writeStatus();
  const failures = [];
  for (const project of PROJECTS) {
    try {
      await pollProject(project);
    } catch (err) {
      console.error(`${timestamp()} ${c.red}[${project.key}] Poll failed:${c.reset}`, err);
      failures.push(`${project.key}: ${err.message}`);
    }
  }
  if (failures.length) throw new Error(failures.join('; '));
  console.log(`${timestamp()} ${c.dim}Poll done. Next one in ${loadSettings().pollIntervalMinutes} minute(s).${c.reset}`);
}

async function pollProject(project) {
  const ts = timestamp();
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
  const myMrsWithSignal = myMrs.map((mr, i) => ({ mr, peerCommentAt: peerCommentAts[i] }));
  const toTriage = myMrsWithSignal.filter(({ mr, peerCommentAt }) => needsTriage(state, mr, peerCommentAt));

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
    ...myMrsWithSignal.map(({ mr, peerCommentAt }, i) => commentsEntry(mr, {
      // No peer comment at all counts as "up to date": there is nothing to triage yet.
      pending: needsTriage(state, mr, peerCommentAt),
      reviewPath: mrCommentsOutputPath(mr),
      reviewedAtMs: triagedAts[i],
      myState: stateOf(mr),
    })),
  ];
  status.mrs = [...status.mrs.filter((m) => m.project !== project.key), ...entries];
  await writeStatus();
  const needCount = toReview.length + toTriage.length;
  const needColor = needCount > 0 ? c.green : c.dim;
  console.log(
    `${ts} [${project.key}] ${c.bold}${reviewMrs.length}${c.reset} MR(s) to review, ${c.bold}${myMrs.length}${c.reset} of my own — ` +
      `${needColor}${toReview.length} need a review, ${toTriage.length} need comment triage${c.reset}.`,
  );

  for (const mr of toReview) await reviewOne(mr, plan, state);
  for (const { mr, peerCommentAt } of toTriage) await triageOne(mr, peerCommentAt, state);

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
    console.log(`${timestamp()} ${c.dim}A poll is already running, ignoring this request.${c.reset}`);
    return;
  }
  clearTimeout(pollTimer);
  isPolling = true;
  try {
    await poll();
    status.phase = 'idle';
    status.lastPoll = { at: new Date().toISOString(), ok: true, error: null };
  } catch (err) {
    console.error(`${timestamp()} ${c.red}Poll failed:${c.reset}`, err);
    // Only notify on the ok -> error transition, not on every failed poll.
    if (status.lastPoll?.ok !== false) notify('Marginalia error', err.message);
    status.phase = 'error';
    status.lastPoll = { at: new Date().toISOString(), ok: false, error: err.message };
  } finally {
    isPolling = false;
    status.current = null;
    scheduleNextPoll(Date.now());
    await writeStatus();
  }
}

// The next poll is due `interval` after the previous one *finished* (`from`).
function scheduleNextPoll(from) {
  const delay = Math.max(from + pollIntervalMs() - Date.now(), 1000);
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
        console.log(`${timestamp()} ${c.dim}Poll interval is now ${loadSettings().pollIntervalMinutes} minute(s).${c.reset}`);
        writeStatus();
      }, 200);
    });
  } catch (err) {
    console.error(`${timestamp()} Could not watch settings.json:`, err.message);
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
