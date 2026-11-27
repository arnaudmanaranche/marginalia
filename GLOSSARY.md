# Glossary

The words below are the only ones the code, the docs and the studio use for these things. A new concept gets an entry here before it gets a name in code.

**Marginalia**: the product as a whole, bot and studio together.

**Factory**: what Marginalia is becoming (ADR 0006): it learns a project, runs lines of jobs on it and leaves every decision to a person. Not a separate service.

**Line**: one kind of job on one project. Review is the first line. Has metrics of its own.

**Job**: one execution of a line on one target, an MR or a branch. Starts from a trigger (poll, webhook, mention, click, branch push) and ends with a result, a visible failure, or closed without action. A run is how a job executes.

**Queue**: the bot's waiting line of tasks, kept in its database so a restart loses nothing. Each project is a lane: its tasks run one at a time, and a few projects run side by side (`QUEUE_WORKERS`). The next task is what a person asked for (a mention, a click, a project to learn) before a poll, then the oldest.

**Budget**: what a day of automatic work may cost (`DAILY_BUDGET_USD`, or the studio's Settings). Every Claude run of the day counts, from local midnight. Once the spend reaches it, automatic work (a poll's reviews and triages, the doctor a failure starts) waits until midnight and its MRs say so (a mark on their tab, the menu bar, one notification); what a person asks for still runs.

**Hold**: why a poll does not start the automatic review of an MR, said on its entry: no push for `staleAfterDays` (which also limits how far back the bot catches up after it was stopped), or someone other than the author approved it on GitLab since its last push. It is not recorded, so a new push takes the MR again; Run again (↻) on its review, or a mention asking for a review, runs it now. Not to be confused with an **Approval**, a person's decision on a write the factory proposes.

**Task**: one thing asked of the bot, waiting its turn in the queue: a poll, a mention to answer, a project to learn. Running a task starts zero or more jobs. The same request while its task still waits joins it.

**Project context**: what the factory has learned about one project: glossary, stack, features and critical paths, each item citing its source. Data stored outside the reviewed repo, approved by a person before reviews use it. Never code in Marginalia.

**Understand**: the job that learns a project into a draft project context, from the repo at its default branch and the read-only connectors (`marginalia understand`). A person approves the draft (`marginalia context approve`); until then reviews keep the last approved one.

**Critical path**: a flow in a project whose breakage costs the most (a user journey for a front-end, a request flow, data write or payment for a back-end). Listed in the project context.

**Own review**: a review of the configured user's own open MR, shown only to them, never posted. Not triage, which works through comments other people left.

**Feed**: Home (ADR 0007): what needs you (reviews whose turn is yours, comments to decide, failures that need a person, a context to approve) ranked by what matters, and the jobs running now, opened by the briefing (ADR 0012). Every job by day is on the Activity page.

**Briefing**: the top of Home (ADR 0012): a greeting, one sentence on what changed since the person last looked at Home (kept per browser), and a few notes the studio draws from the reviews, jobs, queue and budget when something stands out (spend well above a usual day, the same failure repeating, a backlog, a project with no approved context). A note is said only when it is true and worth acting on; a quiet day says so in one line.

**Since you last looked**: the moment this browser last left Home. The briefing counts what changed after it; on a first visit it counts the last day.

**Approval**: a person's decision on a write the factory proposes: approve as-is, edit then approve, or dismiss. Nothing reaches GitLab without an approval or a mention. Sending your review on an MR settles the proposals you left out of it: they leave the approvals inbox until the MR comes back to you (its author pushes or answers).

**Finding outcome**: what happened to a finding: posted as-is, edited, dismissed, or fixed before the MR. The review line's measure.

**Standing**: where one comment I posted stands once the MR moved on: addressed, contested, untouched or dropped. Decided in this order: a comment I dropped is dropped, whatever the code did; a resolved thread over code known to be untouched is contested; changed code, or a resolved thread whose code is not known to be untouched, is addressed; anything else is untouched. Never overclaims: bot silence, a reply alone or an unknown code state alone are untouched.

**Signals**: what is returned alongside a standing: whether the flagged code changed since (or that it cannot be told), whether someone other than me (and not a bot) replied, and whether the thread is resolved. The code and the resolved thread decide the standing; a reply is shown, not weighed. Not the Evidence of a reproduction.

**Disagreement**: a flag on a posted comment when its thread and the code say different things: the thread is resolved but the code it flagged is known to be untouched. Worth a look, so it is shown.

**Reworded**: a finding of a re-run that is probably an earlier finding said differently: same file, some but not most of the title in common. Shown as a pair for a person to judge, never counted as one gone and one new.

**Baseline**: what a recap compares the MR against: the report I last submitted from, or, with nothing submitted, the report before the current one.

**Recap**: what changed on a re-reviewed MR since its Baseline, at a glance: the MR itself (commits, files), where each comment I posted stands (its Standing), and the findings that are new, gone or Reworded. Counts are computed once and read by the review page, the finding list and the MR row.

**Bot**: the `api/` side. It listens, runs the agent, validates the result and posts. It has no screen. Not the studio.

**Studio**: the `ui/` side, the web app where a person reads a review and decides what to say. It talks to the bot over HTTP only. Not the bot.

**Invocation**: one request for the bot to do something on a merge request. It comes from the studio or from a mention. Never "command", which is easy to confuse with a Claude Code slash command.

**Mention**: a GitLab comment that addresses `@marginalia`. One kind of invocation. A bare mention or `review` asks for a review, `triage` works through the comments on the author's own MR, any other text is a question. A reply in a thread that already holds a bot comment is a follow-up and needs no new mention.

**Intake**: how a mention reaches the bot, by **webhook** (GitLab calls the bot) or by **polling** (the bot reads MR notes). Both produce the same record and go through the same guardrails, so a note that arrives twice runs once.

**Run**: one execution of the agent for one invocation on one MR, in its own ephemeral worktree. Ends with a review or a visible failure.

**Pass**: one project's turn in a poll. Lists its open MRs, decides what each needs (review, triage, nothing), shows where each stands, does the work one MR at a time and records it in the state. `passOver()` in `api/src/poll-pass.ts`; a poll is one pass per project.

**Review**: the validated result of a run on an MR, in the shape of the contract. Never a free-form report.

**Contract**: the schema a review must satisfy (`packages/contract`). The bot owns it and the studio renders only what it describes. The bot states it to each stage of a run and checks each answer against it.

**Stage method**: how one stage of a run is asked to work (the review map, a chapter's review, the triage judge, a verify...), apart from the answer shape, which is the contract and stays in code. Versioned in PostHog prompt management and fetched at run time (ADR 0014); the bot holds a built-in copy of each and uses it whenever PostHog is off or cannot answer. A run resolves each method once and uses that copy from start to end: a PostHog version, the last one read when PostHog fails, or the built-in copy, which has no version.

**Guardrail**: a check the bot applies before anything is shown or posted: schema validation of a review, authorization of a mention, deduplication by note id and the daily cap. Mentions found together become one follow-up; waiting is the queue's job. A result that fails a guardrail is never half-rendered and never posted.

**Finding**: one issue in a review, with a severity, a `path:line` on the MR's new file version and a proposed comment.

**Risk axes**: the five questions behind a review's risk level, each low, medium or high with a short note: verification (is it proven to work: tests, before/after), alignment (does it do what the ticket asked and nothing else), impact (blast radius, sensitive areas), rollback (can it be undone: a one-way or two-way door), detection (would a failure be seen: swallowed, logged or reported). The review also lists what would lower the risk (its mitigations). The level is never lower than its worst axis.

**Verification**: trying to reproduce a finding about behaviour against the project, before a person is asked to trust it (ADR 0009). A finding about a pattern is never verified. It runs in a **runner**, not in the bot, from a **recipe** the person approved with the project context. Opt-in per project.

**Reproduction**: the outcome of a verification, on the finding: `reproduced`, `not_reproduced` (kept and flagged, a person decides), `inconclusive` (it failed or timed out) or `skipped` (not behaviour, no recipe, no opt-in, no Docker).

**Runner**: the disposable container a verification runs in: a copy of the MR's worktree, no login and no token, limits on CPU, memory, processes and time, no network but the hosts the recipe names. Not the bot's container.

**Recipe**: the `verification` part of the project context: the commands to set up, run and test the project, the hosts it may reach, and notes. A person approves it with the rest of the context.

**Evidence**: what a reproduction keeps for a person to look at, on the finding: for a behaviour seen in a browser, a screenshot, the console and page errors, the failed requests and a trace (ADR 0010). Taken in the runner, copied out by the bot, shown in the studio, never posted by itself.

**Tour**: the chapters of a review, each explaining one idea in plain words, core change first, database, tests and generated files last.

**Skill**: a unit of review expertise a chapter's reviewer can load, a lens: the global built-in skills and the team's skills, a team skill winning over a built-in of the same name.

**Catalog**: the merged list of skills (name and one-line "use when" description) the agent chooses from. A team skill overrides a built-in one of the same name.

**Post**: sending a comment to GitLab. A **reply** is posted by the bot account after a mention. A **click-to-post** is posted from the studio under the clicking person's own GitLab token. The bot never posts unprompted.
