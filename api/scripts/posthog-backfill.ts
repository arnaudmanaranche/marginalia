// Sends the runs the bot already recorded (the `run` table) to PostHog as marginalia_run events, so
// the dashboards start with history. Safe to repeat: a run always has the same event id, and
// PostHog keeps one event per id. Without --send it only reads the database and prints what it would send.
//   npm run posthog:backfill            what would be sent
//   npm run posthog:backfill -- --send  send it (needs POSTHOG_HOST and POSTHOG_KEY)
import '../src/node-check.ts';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
const { GITLAB_USERNAME } = await import('../src/config.ts');
const { RUNNING_VERSION } = await import('../src/config-team.ts');
const { getDb } = await import('../src/store.ts');
const { readRuns } = await import('../src/db-store.ts');
const { eventsFromRuns } = await import('../src/run-events.ts');
const { createPosthogClient } = await import('../src/posthog.ts');

const send = process.argv.includes('--send');
const rows = readRuns(getDb());
const events = eventsFromRuns(rows, { reviewer: GITLAB_USERNAME, version: RUNNING_VERSION, container: process.env.MARGINALIA_CONTAINER === '1' });
const cost = events.reduce((sum, e) => sum + e.properties.cost_usd, 0);
console.log(`${events.length} runs (${rows[0]?.at.slice(0, 10) ?? '-'} to ${rows.at(-1)?.at.slice(0, 10) ?? '-'}), $${cost.toFixed(2)} in total.`);
if (events.length) console.log('Example event:\n' + JSON.stringify(events.at(-1), null, 2));

if (!send) {
  console.log('\nNothing was sent. Run again with --send (and POSTHOG_HOST, POSTHOG_KEY set) to send them.');
} else if (!process.env.POSTHOG_HOST || !process.env.POSTHOG_KEY) {
  console.error('\nSet POSTHOG_HOST (e.g. https://eu.i.posthog.com) and POSTHOG_KEY (the project API key, phc_...).');
  process.exit(1);
} else {
  const { sent, failed, error } = await createPosthogClient({ host: process.env.POSTHOG_HOST, key: process.env.POSTHOG_KEY }).send(events);
  console.log(`\nSent ${sent}, failed ${failed}${error ? ` (${error})` : ''}.`);
  process.exit(failed ? 1 : 0);
}
