# Several projects

> Reference for the V1 behavior as shipped. V2 changes are in `../architecture.md` and `../adr/`; where they differ, those win.

One install can watch several GitLab projects, each with its own repo, commands and
bot worktree. Put them in `config.json` in the data directory (the install folder for
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
      "reviewCommand": "/review-front", "allowedTargetBranches": ["develop"] }
  ]
}
```

Projects are polled one after the other, so a worktree is never shared. A project's `key`
(from the last part of its GitLab path, or set with `"key"`) prefixes its reviews in the
studio (`back-end/feat-x`), its entries in `state.json` and `posted.json`, and its worktree
(`<data dir>/worktrees/<key>`; the first project keeps `BOT_WORKTREE_DIR`). The first run
after upgrading moves the single-project `state.json` and `posted.json` under the first
project's key: keep a copy if you may go back to an older version. The studio's Settings
page overrides allowed target branches and excluded authors for all projects at once.
`npm run doctor -- --dry-run 123 --project front-end` tries the real chain on one MR.

## Mentions

The bot answers `@<bot username>` in an MR comment (`GITLAB_USERNAME` is the account whose token it uses). Each poll, after a project's pass, it reads the notes that came in since the last poll; the first poll only sets the starting point. A bare mention or `review` runs a review, `triage` works through the comments (the MR's author only), anything else is a question, and a reply under one of the bot's own notes is a follow-up. Only Developer and above can ask; others get one refusal. A note is handled once.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MENTION_DAILY_CAP` | `20` | The most runs mentions may start in a UTC day, all projects together. Past it the bot answers that it is at its limit. |

### Webhook intake

Set `WEBHOOK_SECRET` and the bot opens a second listener with one route, `POST /webhooks/gitlab`. In GitLab, add a project webhook with that URL, the same value as *Secret token*, and only the *Comments* trigger. The token is compared before the body is read; hooks other than a Note Hook are acknowledged and dropped; the answer is `200` at once and the note is queued behind any running poll or run. A note that arrives by webhook and again by polling runs once. Without the secret there is no listener and polling stays the intake.

| Variable | Default | Meaning |
| --- | --- | --- |
| `WEBHOOK_SECRET` | none | Enables the listener; must equal GitLab's secret token. |
| `WEBHOOK_PORT` | `4478` | Port of the listener. |
| `WEBHOOK_HOST` | `127.0.0.1` | Bind address; use `0.0.0.0` inside a container, behind HTTPS. |
