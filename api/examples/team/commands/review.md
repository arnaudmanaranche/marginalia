---
description: The team's review of a merge request (run as /acme-web:review, the plugin name comes from team.json "name").
argument-hint: [MR reference or hint]
---

Review the pending changes of the current branch: `git diff origin/<target>...HEAD`.

Apply the `pr-hygiene` skill first, then review the diff against this repo's own conventions (CLAUDE.md, neighbouring files). Write the review in the shape the bot's output contract asks for; `$ARGUMENTS` is the MR reference.
