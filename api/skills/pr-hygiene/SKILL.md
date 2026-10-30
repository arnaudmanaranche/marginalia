---
name: pr-hygiene
description: Use when judging whether a merge request is shaped to be reviewed and shipped: its size, scope, description, linked ticket, commit history and leftovers.
---

# Merge request hygiene

Check the MR as a deliverable, apart from the code. Findings here are usually `suggestion`, or `important` when the shape hides risk.

- **One purpose.** The title and description say what changes and why. A change that does two unrelated things, or a refactor mixed with a behavior change, should be split: say which parts.
- **Size.** A diff too large to review in one sitting hides bugs. Point at the seam where it could split, do not just say "too big".
- **Description and ticket.** Does the description match what the diff does? Is there a linked ticket, and does the diff cover what it asks, no more? A missing ticket is a finding only if the repo's contributing rules require one. It has no `path`.
- **Leftovers.** Debug output, commented-out code, TODOs without an owner, committed secrets or local config, unrelated formatting churn, a lockfile change with no dependency change.
- **Migration and rollout.** A schema, config or contract change needs a note on order of deploy and rollback. If it is missing, say so.

Do not nitpick commit message style the repo does not enforce.
