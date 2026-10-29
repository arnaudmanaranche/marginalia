# Glossary

The words below are the only ones the code, the docs and the studio use for these things. A new concept gets an entry here before it gets a name in code.

**Marginalia**: the product as a whole, bot and studio together.

**Bot**: the `api/` side. It listens, runs the agent, validates the result and posts. It has no screen. Not the studio.

**Studio**: the `ui/` side, the web app where a person reads a review and decides what to say. It talks to the bot over HTTP only. Not the bot.

**Invocation**: one request for the bot to do something on a merge request. It comes from the studio or from a mention. Replaces "command" (`REVIEW_COMMAND`, `TRIAGE_COMMAND`), which is easy to confuse with a Claude Code slash command.

**Mention**: a GitLab comment that addresses `@marginalia`. One kind of invocation. A bare mention or `review` asks for a review, `triage` works through the comments on the author's own MR, any other text is a question. A reply in a thread that already holds a bot comment is a follow-up and needs no new mention.

**Intake**: how a mention reaches the bot, by **webhook** (GitLab calls the bot) or by **polling** (the bot reads MR notes). Both produce the same record and go through the same guardrails, so a note that arrives twice runs once.

**Run**: one execution of the agent for one invocation on one MR, in its own ephemeral worktree. Ends with a review or a visible failure.

**Pass**: one project's turn in a poll. Lists its open MRs, decides what each needs (review, triage, nothing), shows where each stands, does the work one MR at a time and records it in the state. `passOver()` in `api/src/poll-pass.ts`; a poll is one pass per project.

**Review**: the validated result of a run on an MR, in the shape of the contract. Never a free-form report.

**Contract**: the schema a review must satisfy (`packages/contract`). The bot owns it and the studio renders only what it describes. The skill `marginalia-review` states it for the agent.

**Guardrail**: a check the bot applies before anything is shown or posted: schema validation of a review, authorization of a mention, deduplication by note id, the per-MR queue and the daily cap. A result that fails a guardrail is never half-rendered and never posted.

**Finding**: one issue in a review, with a severity, a `path:line` on the MR's new file version and a proposed comment.

**Tour**: the chapters of a review, each explaining one idea in plain words, core change first, database, tests and generated files last.

**Skill**: a unit of review expertise the agent can load. Three tiers: the contract skill (always loaded), the global built-in skills, and team skills from the reviewed repo's `.claude/`.

**Catalog**: the merged list of skills (name and one-line "use when" description) the agent chooses from. A team skill overrides a built-in one of the same name.

**Post**: sending a comment to GitLab. A **reply** is posted by the bot account after a mention. A **click-to-post** is posted from the studio under the clicking person's own GitLab token. The bot never posts unprompted.
