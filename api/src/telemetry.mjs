// @ts-check
import { GITLAB_USERNAME } from './config.mjs';
import { RUNNING_VERSION } from './config-team.mjs';
import { countRuns } from './db-store.mjs';
import { logger } from './logger.mjs';
import { posthogFromEnv } from './posthog.mjs';
import { failureEvent, runEvent } from './run-events.mjs';
import { getDb } from './store.mjs';

// Anonymous-by-design usage events (see run-events.mjs) to PostHog, off unless POSTHOG_KEY and
// POSTHOG_HOST are set. Fire and forget: a slow or unreachable PostHog never delays or fails a
// review, and one warning per process is all it says about it.
let warned = false;

function send(event) {
  const { client, problem } = posthogFromEnv(process.env);
  if (problem && !warned) {
    warned = true;
    logger.warn(problem);
  }
  if (!client) return;
  void client.send([event]).then(({ failed, error }) => {
    if (failed && !warned) {
      warned = true;
      logger.warn(`PostHog did not take the run event (${error}); further failures are not logged.`);
    }
  });
}

const context = () => ({ reviewer: GITLAB_USERNAME, version: RUNNING_VERSION, container: process.env.MARGINALIA_CONTAINER === '1' });

/** A finished run: `run` is the row appendRun wrote, `report` what the report contained. */
export function trackRun({ run, report }) {
  try {
    let runNumber = 1;
    try {
      runNumber = countRuns(getDb(), { project: run.project, iid: run.iid, kind: run.kind });
    } catch { /* the number is a nicety */ }
    send(runEvent({ run, runNumber, report, ...context() }));
  } catch (err) {
    logger.debug({ err }, 'Could not build the run event');
  }
}

/** A pass that threw: only its class of failure is sent, never the message. */
export function trackFailure({ mr, kind, command, error }) {
  try {
    send(failureEvent({ project: mr.project?.key, iid: mr.iid, kind, command, error: String(error?.message ?? error), at: new Date().toISOString(), ...context() }));
  } catch (err) {
    logger.debug({ err }, 'Could not build the failure event');
  }
}
