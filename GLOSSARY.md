# Glossary

The words below are the only ones the code, the docs and the studio use for these things. A new concept gets an entry here before it gets a name in code.

**Marginalia**: the product as a whole, bot and studio together.

**Factory**: what Marginalia is becoming (ADR 0006): it learns a project, runs lines of jobs on it and leaves every decision to a person. Not a separate service.

**Line**: one kind of job on one project. Review is the first line. Has metrics of its own.

**Job**: one execution of a line on one target, an MR or a branch. Starts from a trigger (poll, webhook, mention, click, branch push) and ends with a result, a visible failure, or closed without action. A run is how a job executes.

**Queue**: the bot's waiting line of tasks, kept in its database so a restart loses nothing. Each project is a lane: its tasks run one at a time, and a few projects run side by side (`QUEUE_WORKERS`). The next task is what a person asked for (a mention, a click, a project to learn) before a poll, then the oldest.

**Budget**: what a day of automatic work may cost (`DAILY_BUDGET_USD`, or the studio's Settings). Every Claude run of the day counts, from local midnight. Once the spend reaches it, automatic work (a poll's reviews and triages, the doctor a failure starts) waits until midnight and its MRs say so (a mark on their tab, the menu bar, one notification); what a person asks for still runs.

**Hold**: why a poll does not start the automatic review of an MR, said on its entry: no push for `staleAfterDays` (which also limits how far back the bot catches up after it was stopped), or someone other than the author approved it on GitLab since its last push. It is not recorded, so a new push takes the MR again; Review again or a mention runs it now. Not to be confused with an **Approval**, a person's decision on a write the factory proposes.

**Task**: one thing asked of the bot, waiting its turn in the queue: a poll, a mention to answer, a project to learn. Running a task starts zero or more jobs. The same request while its task still waits joins it.

**Project context**: what the factory has learned about one project: glossary, stack, features and critical paths, each item citing its source. Data stored outside the reviewed repo, approved by a person before reviews use it. Never code in Marginalia.

**Understand**: the job that learns a project into a draft project context, from the repo at its default branch and the read-only connectors (`marginalia understand`). A person approves the draft (`marginalia context approve`); until then reviews keep the last approved one.

**Critical path**: a flow in a project whose breakage costs the most (a user journey for a front-end, a request flow, data write or payment for a back-end). Listed in the project context.

**Own review**: a review of the configured user's own branch or MR, shown only to them, never posted. Not triage, which works through comments other people left.

**Feed**: Home (ADR 0007): what needs you (reviews whose turn is yours, comments to decide, failures that need a person, a context to approve), the jobs running now, and every job by day.

**Approval**: a person's decision on a write the factory proposes: approve as-is, edit then approve, or dismiss. Nothing reaches GitLab without an approval or a mention.

**Finding outcome**: what happened to a finding: posted as-is, edited, dismissed, or fixed before the MR. The review line's measure.

**Bot**: the `api/` side. It listens, runs the agent, validates the result and posts. It has no screen. Not the studio.

**Studio**: the `ui/` side, the web app where a person reads a review and decides what to say. It talks to the bot over HTTP only. Not the bot.

**Invocation**: one request for the bot to do something on a merge request. It comes from the studio or from a mention. Never "command", which is easy to confuse with a Claude Code slash command.

**Mention**: a GitLab comment that addresses `@marginalia`. One kind of invocation. A bare mention or `review` asks for a review, `triage` works through the comments on the author's own MR, any other text is a question. A reply in a thread that already holds a bot comment is a follow-up and needs no new mention.

**Intake**: how a mention reaches the bot, by **webhook** (GitLab calls the bot) or by **polling** (the bot reads MR notes). Both produce the same record and go through the same guardrails, so a note that arrives twice runs once.

**Run**: one execution of the agent for one invocation on one MR, in its own ephemeral worktree. Ends with a review or a visible failure.

**Pass**: one project's turn in a poll. Lists its open MRs, decides what each needs (review, triage, nothing), shows where each stands, does the work one MR at a time and records it in the state. `passOver()` in `api/src/poll-pass.ts`; a poll is one pass per project.

**Review**: the validated result of a run on an MR, in the shape of the contract. Never a free-form report.

**Contract**: the schema a review must satisfy (`packages/contract`). The bot owns it and the studio renders only what it describes. The bot states it to each stage of a run and checks each answer against it.

**Guardrail**: a check the bot applies before anything is shown or posted: schema validation of a review, authorization of a mention, deduplication by note id and the daily cap. Mentions found together become one follow-up; waiting is the queue's job. A result that fails a guardrail is never half-rendered and never posted.

**Finding**: one issue in a review, with a severity, a `path:line` on the MR's new file version and a proposed comment.

**Risk axes**: the five questions behind a review's risk level, each low, medium or high with a short note: verification (is it proven to work: tests, before/after), alignment (does it do what the ticket asked and nothing else), impact (blast radius, sensitive areas), rollback (can it be undone: a one-way or two-way door), detection (would a failure be seen: swallowed, logged or reported). The review also lists what would lower the risk (its mitigations). The level is never lower than its worst axis.

**Verification**: trying to reproduce a finding about behaviour against the project, before a person is asked to trust it (ADR 0009). A finding about a pattern is never verified. It runs in a **runner**, not in the bot, from a **recipe** the person approved with the project context. Opt-in per project.

**Reproduction**: the outcome of a verification, on the finding: `reproduced`, `not_reproduced` (kept and flagged, a person decides), `inconclusive` (it failed or timed out) or `skipped` (not behaviour, no recipe, no opt-in, no Docker).

**Runner**: the disposable container a verification runs in: a copy of the MR's worktree, no login and no token, limits on CPU, memory, processes and time, no network but the hosts the recipe names. Not the bot's container.

**Recipe**: the `verification` part of the project context: the commands to set up, run and test the project, the hosts it may reach, and notes. A person approves it with the rest of the context.

**Tour**: the chapters of a review, each explaining one idea in plain words, core change first, database, tests and generated files last.

**Skill**: a unit of review expertise a chapter's reviewer can load, a lens: the global built-in skills and the team's skills, a team skill winning over a built-in of the same name.

**Catalog**: the merged list of skills (name and one-line "use when" description) the agent chooses from. A team skill overrides a built-in one of the same name.

**Post**: sending a comment to GitLab. A **reply** is posted by the bot account after a mention. A **click-to-post** is posted from the studio under the clicking person's own GitLab token. The bot never posts unprompted.
