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
