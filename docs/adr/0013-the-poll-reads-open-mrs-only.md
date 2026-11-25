# 0013. The poll reads open MRs only

Status: accepted, 2026-11-25. Amends ADR 0006 on what the review line covers.

Decision: a poll works only on GitLab's open, non-draft MRs. It no longer lists the configured user's branches to review the ones without an MR. An own review (`reviewOwn`) covers the user's open MRs, nothing else.

Why: the branch listing reviewed every recent branch the user pushed, work not meant for review yet, and spent budget on it. An open MR is the signal that a change is ready to be looked at; a draft MR still says it is not.

Consequences: `own-branches.ts` and its `branch:<name>` state entries are gone; old entries are pruned by the next pass. Runs and reviews written for a branch before this stay readable (their `iid` is null).
