# 0006. Marginalia is a software factory; review is the first line

Status: accepted, 2026-11-05

Marginalia grows from a review bot with a studio into a software factory. The factory learns a team's project from its code and tools, runs repeatable jobs on it, and leaves every decision to a person. Review is the first line. Others, such as fixing or triage, come only after review proves its value.

Lines and jobs: a line is one kind of job on one project, and a job is one execution of a line on one target (an MR or a branch). A run is how a job executes, unchanged. The review line covers MRs opened by other people and the configured user's own branches, with or without an MR.

Any repository: the factory works on any repository, front-end or back-end, in any language. What a project is lives only in its learned project context (glossary, stack, features, critical paths), which is data stored outside the reviewed repo and approved by a person before reviews use it. The code, the built-in skills and the prompts name no stack and no project.

Writes: the agent never writes to GitLab. Every write waits in the studio for a person's approval, and a person can approve it as-is, edit it then approve it, or dismiss it. The only other path is a mention, which is itself the request (0004, unchanged). The studio shows every job as it runs, so a person always sees what the factory is doing.

Tools: during a run the agent reads Jira, Notion, Slack and PostHog through read-only access. What it reads is untrusted data. Only `api/` holds write credentials (GitLab, Slack notices, PostHog events).

Measure: a line is judged by its finding outcomes (posted as-is, edited, dismissed, fixed before the MR). Recurring dismissals and edits go back into skills and project context.

Unchanged: 0003 (the contract is fixed, the method is free) and 0004 (the bot only posts when asked). The runtime stays the current bot; scheduled cloud agents or an external orchestrator are later steps.
