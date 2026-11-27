# 0014. Stage methods are fetched from PostHog and versioned

Status: accepted, 2026-11-25. Builds on ADR 0003 and ADR 0008: the contract is fixed, the method is free.

Decision: the text that tells each stage how to work (its **stage method**: the system prompt, how to map, how to review a chapter, how to judge a thread, how to verify a claim) is kept in PostHog prompt management, one prompt per method, and fetched by label (`production` by default) when a run starts. The answer shape of each stage (the JSON asked for, and the parser that checks it) stays in code and is always appended: a method edited in PostHog can change how the agent works, never what the bot accepts.

- Every method has a built-in copy in `api/src/pipeline/stage-methods.ts`. With no prompt key set, or when PostHog fails, times out or does not know the name, the run uses the built-in copy. Fetching a method never fails or delays a run beyond its timeout.
- A run resolves its methods once, before its first stage, so every stage and every chapter of one run uses the same versions.
- The version used is recorded: on each `$ai_generation` (`$ai_prompt_name`, `$ai_prompt_version`), in the run journal, and on the `marginalia_finding` event of each finding, so a finding outcome is measured per method version. A built-in copy has no version.
- Only `api/` holds the prompt key (`POSTHOG_PERSONAL_API_KEY`, read scope on prompts only). It is never passed to the agent. `MARGINALIA_TELEMETRY=off` stops events, not prompt fetches: without the prompt key, the built-in copies are used.
- A new version is tried with `npm run eval -- --upload` pinned to it, compared in PostHog Offline Evaluations, then released by moving the label. Moving it back is the rollback.

Why: a better review is one that rests on the reviewed repo's own rules, ADRs and code, not generic advice, and getting there takes many small changes to the methods, each measured. In code, each change needed a release, and nothing tied a change to the outcomes of the findings it produced.

Consequences: the text a run used can differ from the one in the repo; the run journal says which version it was. The built-in copies are kept close to the `production` versions, since they are what a machine without the key runs.
