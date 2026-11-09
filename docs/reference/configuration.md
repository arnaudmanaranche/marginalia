# Several projects

One install can watch several GitLab projects, each with its own repo and bot worktree. Put them in `config.json` in the data directory (the install folder for
a clone that has a `.env`, else `~/.marginalia`; `MARGINALIA_HOME` overrides it). It wins
over `.env`, which keeps working as a single project:

```json
{
  "gitlabBaseUrl": "https://git.example.com",
  "gitlabUsername": "me",
  "gitlabToken": "glpat-...",
  "projects": [
    { "gitlabProjectId": "group/back-end", "repoLocalPath": "/code/back-end", "kind": "back" },
    { "gitlabProjectId": "group/front-end", "repoLocalPath": "/code/front-end", "kind": "front",
      "triage": false, "allowedTargetBranches": ["develop"] }
  ]
}
```

Each project is a lane of the queue: its tasks run one at a time, so its worktree is never
shared, and up to `QUEUE_WORKERS` projects run side by side. `"triage": false` (or `TRIAGE=false`
in a single-project `.env`) ignores your own MRs on that project. A project's `key`
(from the last part of its GitLab path, or set with `"key"`) prefixes its reviews in the
studio (`back-end/feat-x`), its entries in `state.json` and `posted.json`, and its worktree
(`<data dir>/worktrees/<key>`; the first project keeps `BOT_WORKTREE_DIR`). The first run
after upgrading moves the single-project `state.json` and `posted.json` under the first
project's key: keep a copy if you may go back to an older version. The studio's Settings
page overrides allowed target branches and excluded authors for all projects at once.
`npm run doctor -- --dry-run 123 --project front-end` tries the real chain on one MR.

## Own reviews

`"reviewOwn": true` on a project (or `REVIEW_OWN=true` in a single-project `.env`) also reviews
your own open MRs, once per push, with the same staged review. An own review is written to
`own-<branch>.md`, shows only to you, and is never posted: the studio's posting routes refuse it
whatever `ALLOW_POSTING` says. The triage of the comments on your MRs keeps working beside it.

It also reviews your branches that have no open MR yet (a draft MR does not count): branches whose
last commit is yours (by your GitLab emails or name), pushed within `STALE_AFTER_DAYS`, other than
the default or a protected branch. The diff is taken from where the branch left the default branch.
The review goes to the same `own-<branch>.md`, so when you open the MR its own review continues
there, and is not run again at the same commit. Own reviews use a detached checkout: your branch
can stay checked out in your own clone.

## Verification

`"verify": true` on a project lets a review reproduce its findings about behaviour in a disposable
runner (ADR 0009). It needs Docker and an approved project context with a `verification` section,
and is off by default. `"verifyLimits"` overrides what one verification may use; the defaults are
`{ "cpus": 2, "memoryMb": 4096, "pids": 256, "timeoutMinutes": 10 }`.

The runner is a Docker container per verification, removed after it: `VERIFY_RUNNER_IMAGE` is its
image (it needs the project's toolchain), `DOCKER_BIN` the client (`docker` by default). It mounts
a copy of the MR's worktree and nothing of the bot, has no login and no token, and no network.
The hosts a recipe names are reachable only through an egress proxy you run: `VERIFY_EGRESS_NETWORK`
is a Docker network where only that proxy sits and `VERIFY_EGRESS_PROXY` its URL (both or neither);
the proxy enforces the allowlist, Marginalia cannot (`api/bin/egress-proxy.ts` is one, see
[Running verification](verification.md)). When the bot runs in a container and reaches Docker through
the docker guard, `VERIFY_WORK_VOLUME` is the named volume its runners mount and `VERIFY_WORK_DIR` where the
bot has that volume (each copy of a worktree is made there); `compose.verify-hosted.yaml` sets both.

## Mentions

The bot answers `@<bot username>` in an MR comment (`GITLAB_USERNAME` is the account whose token it uses). Each poll, after a project's pass, it reads the notes that came in since the last poll; the first poll only sets the starting point. A bare mention or `review` runs a review, `triage` works through the comments (the MR's author only), anything else is a question, and a reply under one of the bot's own notes is a follow-up. Only Developer and above can ask; others get one refusal. A note is handled once.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MENTION_DAILY_CAP` | `20` | The most runs mentions may start in a UTC day, all projects together. Past it the bot answers that it is at its limit. |
| `QUEUE_WORKERS` | `2` | How many projects the bot works on at once, each one task at a time (a project's tasks share its bot worktree). Each worker can run Claude, so this is also how many runs may go side by side. |
| `DAILY_BUDGET_USD` | `25` | What a day of automatic work may cost, every Claude run of the day counted from local midnight; `0` is no limit. Past it, a poll's reviews and triages wait until midnight (not recorded, so the next day takes them) and a failure no longer starts the doctor by itself; mentions, "Review again", chats and Understand still run. A review already running finishes, so the spend can go a little past. The studio's Settings page overrides it. |

### Webhook intake

Set `WEBHOOK_SECRET` and the bot opens a second listener with one route, `POST /webhooks/gitlab`. In GitLab, add a project webhook with that URL, the same value as *Secret token*, and only the *Comments* trigger. The token is compared before the body is read; hooks other than a Note Hook are acknowledged and dropped; the answer is `200` at once and the note is queued behind any running poll or run. A note that arrives by webhook and again by polling runs once. Without the secret there is no listener and polling stays the intake.

| Variable | Default | Meaning |
| --- | --- | --- |
| `WEBHOOK_SECRET` | none | Enables the listener; must equal GitLab's secret token. |
| `WEBHOOK_PORT` | `4478` | Port of the listener. |
| `WEBHOOK_HOST` | `127.0.0.1` | Bind address; use `0.0.0.0` inside a container, behind HTTPS. |
