# Logs, type checking and monitoring

> Reference for the V1 behavior as shipped. V2 changes are in `../architecture.md` and `../adr/`; where they differ, those win.

The bot logs through [pino](https://getpino.io): one human line per event, with the project and MR
when there is one (`[2026-10-21T15:17:14.285Z] INFO: [webapp] [MR !3987] Starting review`),
coloured only in a terminal so `tail -f ~/Library/Logs/marginalia.log` stays readable. Set
`MARGINALIA_LOG=json` for one JSON object per line (with `project` and `iid` as keys), and
`MARGINALIA_LOG_LEVEL` (`debug`, `info`, `warn`, `error`; default `info`) to change the verbosity.
The `npm run doctor` / `init` / `marginalia` command output is plain console text, not the log.

`npm run typecheck` runs `tsc` over `api/` (strict, `noImplicitAny` included) and builds the contract first; CI fails when it stops passing. `npm run build` is the same compile, written to `dist/`.

## Monitoring with PostHog

Optional and off by default. With `POSTHOG_HOST` (`https://eu.i.posthog.com`, `https://us.i.posthog.com`
or your own instance) and `POSTHOG_KEY` (the project API key `phc_...`, which can only write events) in the
environment, every finished Claude run sends one `marginalia_run` event, and a pass that fails sends one
with `outcome: failed` and a class of error (`git`, `gitlab`, `claude`, `timeout`, `permission`, `no_report`,
`other`). `MARGINALIA_TELEMETRY=off` turns it off whatever else is set. A slow or unreachable PostHog never
delays or fails a review; it logs one warning per process.

The event carries ids and numbers only, never an MR title, a branch name, a diff or any review text:
`project`, `mr_iid`, `kind` (`review`, `triage`, `chat`), `command`, `cost_usd`, `output_tokens`, `turns`,
`duration_ms`, `run_number` and `rerun` (this MR had a pass of this kind before), and for reviews
`verdict`, `risk`, `critical`, `important`, `postable`, `report_source`, `contract_warnings`. It is sent
with `$process_person_profile: false` (events, not people) under the id `marginalia:<your GitLab username>`.

Runs the bot recorded before you turned it on are in the `run` table; `npm run posthog:backfill` shows what
would be sent, and `npm run posthog:backfill -- --send` sends it. A run always has the same event id, so
sending it twice, or after live events started, never duplicates it. `doctor --dry-run` never sends.
