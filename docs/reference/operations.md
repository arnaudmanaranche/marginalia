# Logs, type checking and monitoring

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

A `marginalia_run` event carries ids and numbers only, never an MR title, a branch name, a diff or any review text:
`project`, `mr_iid`, `kind` (`review`, `triage`, `chat`), `command`, `cost_usd`, `output_tokens`, `turns`,
`duration_ms`, `run_number` and `rerun` (this MR had a pass of this kind before), and for reviews
`verdict`, `risk`, `critical`, `important`, `postable`, `report_source`, `contract_warnings`, `own_review`
and `critical_paths` (how many of the project's critical paths the review says it touches). It is sent
with `$process_person_profile: false` (events, not people) under the id `marginalia:<your GitLab username>`.

The review line's measure is what becomes of each finding: a `marginalia_finding` event when a finding's
comment is added to a GitLab review from the studio, with `outcome` `posted` (as the review proposed it),
`posted_edited` (changed first), `dismissed` (decided not worth saying, from the approvals inbox) or
`fixed_before_mr` (an own review's finding whose code a later push changed, counted once; `mr_iid` is null for a
branch without an MR yet), plus `project`, `mr_iid`, `finding_id`, `severity`, `own_review` and
`critical_paths`. No title, comment or path. The same finding of the same review is one event.

### AI observability

The same configuration also sends every Claude call (a review stage, triage, Understand, chat, a mention
answer, doctor) to PostHog's LLM Analytics as one `$ai_generation`, with a `$ai_span` per tool it used
(`api/src/ai-events.ts`, `api/src/ai-observability.ts`). The calls of one job share its trace
(`$ai_trace_id` is the run id), so a review is one trace with a generation per stage. A generation has the
model, input, output and cache tokens, `$ai_total_cost_usd`, `$ai_latency`, turns, the line (`marginalia_kind`)
and project, and on a failure `$ai_is_error` with the same class of error as above. A span carries a tool's
name, never its input or output. The capture is fire and forget: it never delays or fails a run.

The prompt and the answer (`$ai_input`, `$ai_output_choices`) are sent only with `MARGINALIA_AI_CONTENT=on`.
They hold the reviewed team's code and the MR's content, so turn it on only where PostHog may keep that.
Off, nothing but numbers and names leaves. Tests never reach PostHog: they clear these variables.

Runs the bot recorded before you turned it on are in the `run` table; `npm run posthog:backfill` shows what
would be sent, and `npm run posthog:backfill -- --send` sends it. A run always has the same event id, so
sending it twice, or after live events started, never duplicates it. `doctor --dry-run` never sends.
