---
name: pr-hygiene
description: Check that a merge request is easy to review and safe to merge: focused scope, a description that says why, tests for the behaviour it changes. Use when reviewing an MR.
---

# MR hygiene

Before the line-by-line review, answer three questions in a sentence each.

1. **Scope**: does the MR do one thing? Unrelated changes (a refactor next to a fix) are a finding, with the split you would ask for.
2. **Why**: does the description say why, not only what? A missing ticket or rationale is a suggestion, not a blocker.
3. **Tests**: is each changed behaviour covered by a test that would fail without it? Name the uncovered one.

Report these under the overview; do not repeat them as findings unless they block the merge.
