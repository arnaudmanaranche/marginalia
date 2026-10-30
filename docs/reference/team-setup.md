# Team setup

> Reference for the V1 behavior as shipped. V2 changes are in `../architecture.md` and `../adr/`; where they differ, those win.

A team shares its review skills and defaults through a **team repo**: an ordinary git
repo that every dev pulls. Everyone then reviews with the same skills and the same
defaults, and the codebase stays the memory. It is not a hosted service and not a GitLab
bot: each dev still runs their own marginalia, with their own token, on their own machine.

**What goes in the team repo** (a skeleton to copy is in `examples/team/`):

```
team.json         defaults and the list of GitLab projects (no path, no secret)
skills/           shared Claude Code skills       (skills/<name>/SKILL.md)
commands/         shared slash commands           (commands/<name>.md)
agents/           shared agents                   (agents/<name>.md)
```

```json
{
  "version": 1,
  "name": "Acme Web",
  "minMarginalia": "1.0.0",
  "defaults": {
    "reviewCommand": "/acme-web:review",
    "triageCommand": "/mr-comments",
    "allowedTargetBranches": ["develop"],
    "excludeAuthors": ["renovate-bot"],
    "claudeExtraAllowedTools": [],
    "reviewPromptExtra": "Answer in English."
  },
  "projects": [
    { "gitlabProjectId": "acme/web/back-end", "key": "back-end", "kind": "back" },
    { "gitlabProjectId": "acme/web/front-end", "key": "front-end", "kind": "front",
      "allowedTargetBranches": ["develop", "release"] }
  ]
}
```

`version` is 1, `name` and `version` are required, the rest is optional. A project entry
takes `gitlabProjectId`, `key`, `kind`, `reviewCommand`, `triageCommand`,
`allowedTargetBranches` and `excludeAuthors`. Unknown fields are errors (a typo would
otherwise be ignored), and `minMarginalia` makes an older marginalia say "update" instead
of misreading a newer file.

**How a dev joins.** Set `"teamRepo": "git@git.example.com:acme/marginalia-team.git"` in
`config.json` (or `MARGINALIA_TEAM_REPO`), run `node scripts/team-sync.mjs`, then add to
`projects` an entry with your `repoLocalPath` for each team project you review: the report
lists the ones you have not mapped. The repo is cloned into `<data dir>/team`; later syncs
fetch and fast-forward only. Offline, a local change in the copy, or a rewritten history
make the sync say so and leave the last good copy in use, so a review never waits on the
network. `doctor` reports a failed or stale sync and a team that needs a newer marginalia.

**How it layers.** For each setting, the order is: your own value, then the team's entry
for that project, then the team defaults, then the built-in default. Your `config.json`
is never rewritten, and a team value never replaces one you wrote. `claudeExtraAllowedTools`
are added to yours, so read them in the team repo's review like any other code. A team project you
have not mapped is not watched.

The team's skills, commands and agents are loaded into each headless run with
`claude --plugin-dir <data dir>/team-plugin` (a generated manifest plus links to the team
copy). Nothing is written into your repo's `.claude/`, and your own commands keep working.
Plugin commands carry the plugin's name, the slug of `name` in `team.json`:
`"name": "Acme Web"` gives `/acme-web:review`, which is what the team defaults'
`reviewCommand` should say. The team files are as protected as your own
`.claude/{commands,agents,skills,hooks}`: the run cannot edit them.

**What the bot never does.** It never posts to GitLab by itself, never listens for
webhooks or mentions, and never runs on a server; it does not write to your repo or to the
team repo (the copy is read-only, changes go through the team repo's own MRs); and the
team file never carries a token or a local path.
