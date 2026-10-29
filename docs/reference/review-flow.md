# Review flow

> Reference for the V1 behavior as shipped. V2 changes are in `../architecture.md` and `../adr/`; where they differ, those win.

- Optional filter on the target branch via `ALLOWED_TARGET_BRANCHES` (e.g. `develop`).
- Always ignores draft MRs, and those whose author is listed in
  `EXCLUDE_AUTHORS` (GitLab usernames, not emails, comma-separated).
- Ignores MRs with no activity (`updated_at`) for more than `STALE_AFTER_DAYS`
  days (14 by default): beyond that, they've likely diverged from `develop`
  or been abandoned.
- On first run, creates a git worktree of `REPO_LOCAL_PATH` at
  `BOT_WORKTREE_DIR` (detached, then a `.claude` symlink back to your real
  checkout so the command/agent/settings/connectors are available in it).
  Before each review/triage, checks out the MR's branch there — skipping the
  MR instead of forcing it if that branch happens to be checked out somewhere
  else (e.g. your own working copy). If you keep a worktree open per MR, set
  `BOT_CHECKOUT=detached`: the bot then checks out the MR's head without any
  local branch, so it never skips and never moves one of your branches
  (triage fixes still land on `marginalia/<branch-slug>`).

## Stacked MRs

An MR whose target branch is the source branch of another open MR is a layer of
a stack (rebuilt from the open MR list on every poll). For these:

- `ALLOWED_TARGET_BRANCHES` is checked against the branch the whole stack is
  based on, so upper layers are not filtered out.
- Layers are reviewed bottom to top, and each run gets the stack in its prompt:
  the layer list, the existing reviews of the other layers, and the layers above
  fetched locally (`refs/marginalia/stack/<iid>`) so it can check whether a later
  layer settles an issue before reporting it. The review ends with an
  `### Across layers` section (`- [settled-later|belongs-lower|assumes-upper !<iid>] <text>`).
- A layer is re-reviewed when the layer below it gets new commits
  (`state.json` keeps that commit under `stackBelow`).
- The studio shows the stack above the review as a merge board.
- Layers you authored yourself are not shown on the board (they go through triage).

## Marginalia's staged pipeline (`REVIEW_COMMAND=marginalia`, `TRIAGE_COMMAND=marginalia`)

Instead of one long Claude call running your repo's slash command, the bot drives the work
itself, in stages you follow live in the studio (each with its steps, time and cost):

- **Review of a colleague's MR.** The bot checks out the MR and gathers, in code, the diff from
  where the branch left its target, the ticket (when Jira is configured), the conversation and
  the last report. One agent **maps** the change: before/after, risk, and chapters (one idea
  each, core first, tests and generated files last). Then one agent **per chapter** reviews it,
  three at a time, reading the repo's own rules (`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING`,
  `docs/adr`, and `.claude/agents/code-reviewer.md` as its checklist). The bot merges their
  findings by rule: duplicates dropped, stable ids, the verdict from the severities. A chapter
  that fails is said in the report; the others still count.
- **Triage of my own MR.** The bot gathers the open reviewer threads with the code they are
  about. When the MR conflicts with its target, it first **merges the target in** (a merge, so
  the push stays a fast-forward) and one agent settles the conflicted files; the bot checks no
  marker is left before committing the merge, else undoes it. A conflict alone starts a triage.
  One agent **weighs** the threads (fix, already fixed, not relevant, wrong, answer) and drafts
  the replies; then one agent **per thread to fix** makes that change, which the bot commits on
  its own with the thread in a `Marginalia-Thread` trailer. In the studio, each thread's fix can
  be **pushed alone** from its card (the others are replayed on top of it, still to push), and
  its reply names the commit that landed. A fix that fails is rolled back.
- **Preflight.** Every run, staged or not, starts by checking in a few seconds that Claude is
  logged in, the GitLab token reads the project, origin serves the MR's head, and for a triage
  that this machine can push to the branch (`git push --dry-run --no-verify`). One that would
  stop the run half way stops it there, before any agent is paid for, with what to do. The
  ticket is checked too, but a run without it goes on and says so.
- Each stage has only the tools its job needs (read-only for the review; edit, never commit,
  for a fix or a conflict), and its answer is checked against a contract: one that does not fit
  is sent back once, in the same session, with what was wrong.

A slash command (`/code-review`, `/mr-comments`) still works as before, as described below.

## MRs authored by someone else (`GITLAB_USERNAME` doesn't match)

- Runs `claude -p "/code-review MR !<iid>"` in the bot worktree. The command
  handles ticket/MR lookup, diffing, the nested review worktree, and writing
  the result — this bot only triggers it and parses the review out of stdout.
- **The bot never posts anything to GitLab.** (The only way to post is the studio's opt-in button, see [Review studio](studio.md).) Each review lands at
  `<REPO_LOCAL_PATH>/.claude/reviews/<branch-slug>.md`, for you to read and
  decide what to do with — the review command's own instructions forbid it from
  posting anything itself.
- State (last SHA reviewed per MR) is kept in `state.json`, at the project
  root (gitignored). Deleting it forces a re-review of all open MRs on the
  next poll.

## MRs you authored yourself (`mr.author.username === GITLAB_USERNAME`)

- Instead of the review command, polls the MR's GitLab discussions for comments
  left by someone other than you. Runs `claude -p "/mr-comments MR !<iid>"`
  in the bot worktree only when a new (or newer) peer comment appears since
  the last triage — a fresh push with no new comment does **not** retrigger
  it.
- the triage command triages every unresolved comment against the ticket AC and
  the diff: applies fixes for the ones it judges relevant directly in the bot
  worktree, and drafts (but never posts) a reply for the rest. In bot mode it
  writes its report to a plain file (`.marginalia-report.md`) in the bot
  worktree rather than printing it — a subagent's output only reaches the
  orchestrating command as a tool result, never as text `claude -p
  --output-format text` captures, so relying on the orchestrator re-emitting
  it verbatim as its own final message proved unreliable in practice (see
  `api/src/claude-runner.mjs`'s comment on `MR_COMMENTS_REPORT_FILE`). This bot
  reads that file directly and writes the real report to
  `<REPO_LOCAL_PATH>/.claude/reviews/mr-comments-<branch-slug>.md`.
- **Fixes are committed locally in the bot worktree, never pushed.** Since
  the worktree gets `git clean -fdx` + `git reset --hard` before the next
  checkout, that commit is preserved separately under a local-only branch
  `marginalia/<branch-slug>` (the bot worktree shares its git object
  database with `REPO_LOCAL_PATH`, so this branch is visible from your real
  checkout too, e.g. `git log marginalia/<branch-slug>` or
  `git cherry-pick` from there — nothing is pushed by the bot). The studio's
  *Fixes to push* card checks them against the MR branch on origin: *ready*
  (on top of the current head), *pushed*, or *outdated* (the branch moved
  since the triage: re-run it), and pushes them, fast-forward only, after a
  confirmation (no switch: the MR is yours). A triage that commits nothing
  moves the previous fixes aside to `refs/marginalia/superseded/<branch-slug>`,
  and a triage during which the branch moved logs a warning.
- **You answer the reviewers from the studio.** The triage drafts one reply per
  unresolved thread in its findings JSON (`replies`: thread id, verdict, text,
  whether to resolve), from the threads the bot reads with your token and hands
  to the run. On your own MR the studio shows, under *Reply to the reviewers*,
  each open thread with that drafted reply, editable, and a *Resolve the thread*
  box (ticked when the comment was fixed). *Add reply* creates a GitLab draft
  note in the thread (`in_reply_to_discussion_id`); *Send replies (N)* publishes
  them all at once, resolving the threads you ticked. A comment the triage fixed
  can only be answered once the fix is pushed, and the reply ends with
  `Fixed in <sha>.`. None of this needs `ALLOW_POSTING`, which is about other
  people's MRs.
- **Everything the triage writes is in English** (report, drafted replies,
  findings, commit messages): the bot's injected contract says so, whatever
  language the command or the comments are in.
- State (last peer-comment timestamp triaged per MR) is kept in `state.json`
  under `mineComments`, separately from the SHA-based state above.

Both flows share the same detailed step-by-step logs (worktree checkout,
duration, path of the written file), each line prefixed with `[MR !<iid>]` to
track several MRs across polls in the logs.
