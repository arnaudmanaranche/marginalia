# 0011. The bot worktree is always detached

Status: accepted, 2026-11-20.

Decision: every run checks out the MR's head (or a branch's head) **detached** in the bot worktree. The bot never takes, moves or commits on a local branch. `BOT_CHECKOUT` is gone.

Why: a `git worktree` shares its refs with the repo it belongs to. The old default, `checkout -B <source_branch>`, reset that local branch to the MR head in the repo a person works in, whenever the branch was not checked out somewhere. Commits on it that were never pushed then lived only in the reflog. A triage also committed its fixes on that branch, so the person's own branch held the bot's commits. The only guard was "skip the MR while its branch is checked out elsewhere", which also blocked reviews for no reason.

Nothing needed the branch name. A triage's fixes are recorded on `marginalia/<slug>` from `HEAD` (`fixes.ts`), and pushes go to the MR branch on origin by sha, fast-forward only. Own reviews and mention answers were already detached-safe.

What changes: a review is no longer skipped because its branch is open in another worktree. A local branch of the same name, if any, is left exactly as it was.
