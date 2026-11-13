# Review flow

- Optional filter on the target branch via `ALLOWED_TARGET_BRANCHES` (e.g. `develop`).
- Always ignores draft MRs, and those whose author is listed in
  `EXCLUDE_AUTHORS` (GitLab usernames, not emails, comma-separated).
- Ignores MRs with no activity (`updated_at`) for more than `STALE_AFTER_DAYS`
  days (14 by default): beyond that, they've likely diverged from `develop`
  or been abandoned.
- Holds the automatic review of an MR (GLOSSARY: Hold) when its last push is older than
  `STALE_AFTER_DAYS`, or when someone other than its author approved it since that push.
  An approval GitLab gives without a time (`approved_at` missing) counts as given since the last
  push. That holds only on projects where GitLab resets approvals on push (Settings → Merge requests →
  Approval settings → "Remove all approvals when commits are added to the source
  branch"). On a project without it, an old approval keeps holding the MR after new pushes;
  Run again (↻) or a mention asking for a review still runs it.
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

## Marginalia's staged pipeline

Every review and triage is driven by the bot itself, in stages you follow live in the studio
(each stage an agent with its tool calls, time, tokens and cost):

- **Review of a colleague's MR.** The bot checks out the MR and gathers, in code, the diff from
  where the branch left its target, the ticket (when Jira is configured), the conversation and
  the last report. One agent **maps** the change: before/after, risk, and chapters (one idea
  each, core first, tests and generated files last). Then one agent **per chapter** reviews it,
  three at a time, reading the repo's own rules (`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING`,
  `docs/adr`, and `.claude/agents/code-reviewer.md` as its checklist) and loading the review
  lenses its files call for (the built-in skills and the team's, with the Skill tool). The bot merges their
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
- **Preflight.** Every run starts by checking in a few seconds that Claude is
  logged in, the GitLab token reads the project, origin serves the MR's head, and for a triage
  that this machine can push to the branch (`git push --dry-run --no-verify`). One that would
  stop the run half way stops it there, before any agent is paid for, with what to do. The
  ticket is checked too, but a run without it goes on and says so.
- Each stage has only the tools its job needs (read-only for the review, the connectors
  included; edit, never commit, for a fix or a conflict), and its answer is checked against a contract: one that does not fit
  is sent back once, in the same session, with what was wrong.

## Verification

Off by default; a project opts in with `"verify": true` (see Configuration). Verification is part of each
**chapter's job** (ADR 0010): as soon as a chapter's reviewer has answered, the blocking findings it labelled
`proof: runtime` (a claim about behaviour, not about a pattern) are tried against the project, while the other
chapters are still being read, so the evidence arrives with the chapter. The chapters share one budget: a few
findings per review at most (`VERIFY_MAX_PER_REVIEW`, 4, first come first served, most severe first within a
chapter), two runners at a time, and a finding another chapter already took is not run twice (the merge keeps
the reproduction on the one it keeps). One agent per finding, in a stage of its own (`Reproduce: <title>`, listed
right after its chapter), reads the code, creates a throwaway test or script with `write_file` and runs it through `run`.
Both tools are served by the bot (`api/bin/verify-mcp.ts`) and act on a **disposable runner**, not
on the agent's machine: a container per verification with a copy of the worktree (no `.git`, no
`.env`, no symlink), no login, no token, a read-only root, no capability, limits on CPU, memory,
processes and time, and no network unless an egress proxy is configured (ADR 0009). `run` accepts
only a step of the **recipe** a person approved with the project context, plus arguments, never
chained; `write_file` only creates new files.

**Browser evidence** (ADR 0010). When the recipe has a `browser` (the URL the `run` step serves the project
at), the verifying agent also has a `browse` tool: one browser step per call (`open` on localhost or a recipe
host, `snapshot`, `click`, `fill`, `press`, `wait`, `evidence`), driven by `agent-browser` in the same runner.
`evidence` keeps a screenshot, the console, page errors and the requests the page made in the data directory
(`evidence/<project>/<run>-<stage>/`); the finding's `verification.artifacts` points at them and the studio shows the
picture and links the logs, served by `GET /api/evidence/{project}/{id}/{name}` (only for a project the caller can see). It needs the browser runner image
(`deploy/runner/Dockerfile.browser`). Evidence is shown, never posted to GitLab by itself.

Each finding then carries `verification`: `reproduced`, `not_reproduced` (kept, flagged: a person
decides), `inconclusive` (the run failed or timed out) or `skipped` with the reason (no runner
image, no recipe, the daily budget reached, over the limit). A verification never fails the review.
`marginalia doctor` checks Docker, the image and the recipe for each project that opted in.

`npm run eval -- verify-reproduces` and `-- verify-skips-pattern` check it with the real `claude`: a seeded
runtime bug must come back `reproduced`, and a change that only breaks a naming rule must run nothing. Their
`expect.json` has a `verification` field and a `context.json` (the recipe, approved for the run). They need
Docker and `VERIFY_RUNNER_IMAGE` set to an image with `node`; without it the case fails saying so.

## MRs authored by someone else (`GITLAB_USERNAME` doesn't match)

- The staged review above runs in the bot worktree.
- **The bot never posts anything to GitLab.** (The only way to post is the studio's opt-in button, see [Review studio](studio.md).) Each review lands at
  `<data dir>/reviews/<project>/<branch-slug>.md`, for you to read and
  decide what to do with. They are kept in Marginalia's data, not in the reviewed repository, so a clean or a branch
  switch there never loses a review or the head it was made for. Reviews an older install left in
  `<REPO_LOCAL_PATH>/.claude/reviews` are copied over at start-up, never overwritten or deleted.
- State (last SHA reviewed per MR) is kept in the database. Clearing it forces a re-review of
  all open MRs on the next poll.

## MRs you authored yourself (`mr.author.username === GITLAB_USERNAME`)

- Instead of a review, polls the MR's GitLab discussions for comments left by someone other
  than you, and runs the staged triage above only when a new (or newer) peer comment appears
  since the last triage, or the MR conflicts with its target — a fresh push with no new comment
  does **not** retrigger it. `"triage": false` on the project turns this off.
- The report is written to
  `<data dir>/reviews/<project>/mr-comments-<branch-slug>.md`.
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
  findings, commit messages): every stage is told so, whatever language the
  comments are in.
- State (last peer-comment timestamp triaged per MR) is kept in `state.json`
  under `mineComments`, separately from the SHA-based state above.

Both flows share the same detailed step-by-step logs (worktree checkout,
duration, path of the written file), each line prefixed with `[MR !<iid>]` to
track several MRs across polls in the logs.
