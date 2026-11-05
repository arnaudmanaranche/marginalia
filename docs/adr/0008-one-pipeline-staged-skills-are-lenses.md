# 0008. One pipeline: every run is staged, and skills are lenses of its chapters

Status: accepted, 2026-11-05. Supersedes the skill tiers and the contract skill of ADR 0003.

Decision: every review and triage runs Marginalia's staged pipeline. The path that ran a slash command of the reviewed repo (`REVIEW_COMMAND`, `TRIAGE_COMMAND`, `command-run.ts`) is gone, with the report files it wrote and the contract skill `marginalia-review` that told it the format. The bot states the contract to each stage in its prompt and checks each answer against it, so the format no longer needs a skill.

Skills become **lenses**: the eight built-ins (`pr-hygiene`, `correctness`, `security`, `tests`, `maintainability`, `compatibility`, `performance`, `critical-path-impact`) and the team's skills, merged into one catalog where a team skill wins over a built-in of the same name. Each chapter's reviewer gets the catalog with the Skill tool and loads the lenses its files call for. Both plugins stay read-only to the run. A team's `REVIEW_PROMPT_EXTRA` is told to every stage.

Why: one long command run was opaque (one session, sub-agents, a flat stream of steps) and hard to measure; the staged pipeline makes each agent, its tool calls, its time and its cost visible, and its answers are checked one stage at a time. One user, so no compatibility to keep.

What stays from ADR 0003: the contract is fixed and validated, an invalid result is a visible failure, the bot knows no stack.

Verification: the staged pipeline tests with a fake `claude` (only the chapters load lenses), the catalog tests, and `npm run eval` through the staged pipeline.
