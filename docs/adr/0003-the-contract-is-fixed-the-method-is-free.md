# 0003. The contract is fixed, the method is free

Status: accepted, 2026-10-29

Decision: the bot fixes the shape of a review (verdict, overview with before/after, tour, findings with severity, `path:line` and a proposed comment) in `packages/contract`, and validates every result. An invalid result is a visible failure and is never partly rendered or posted. How the agent reaches it is its own: tools, sub-agents, skills, order.

Skills have three tiers: `marginalia-review` (the contract, always loaded), global stack-agnostic built-ins (`pr-hygiene`, `correctness`, `security`, `tests`, `maintainability`, `compatibility`, `performance`), and team skills from the reviewed repo's `.claude/`, which win over a built-in of the same name. The agent picks from one merged catalog. There is no per-project skill list and the bot knows no stack.

The contract is stated for the agent in one place, the skill. `examples/commands/review.md` becomes a generated copy or goes away.

Verification: deterministic contract and catalog tests, flow tests on the in-memory GitLab adapter with a scripted fake `claude`, and a manual `npm run eval` over seeded MRs.
