---
name: maintainability
description: Use when judging how well a change fits the codebase and how easy it will be to change later: structure, naming, duplication, coupling and the repo's own conventions.
---

# Maintainability

The standard is what this repo already does and writes down. Read its `CLAUDE.md`, `AGENTS.md`, contributing guide and ADRs, and two or three files next to the changed ones, before judging.

- **Fits the pattern.** A finding that cites the repo's own rule or an existing example is worth ten that cite taste. With no rule on a point, it is a `suggestion` at most.
- **Responsibility.** A module or function doing two jobs, pure logic tangled with I/O, a new layer where the repo has none.
- **Duplication and reuse.** A helper that already exists, or code copied where a shared one belongs. Three similar lines are fine; a copied block with a bug fixed in one place is not.
- **Names and comments.** A name that lies, a comment that says what the code does instead of why, a comment now false.
- **Coupling.** An import across a boundary the repo keeps, a new global, a flag threaded through many layers.
- **Dead and speculative code.** Unused exports, options nobody sets, abstractions for a second use that does not exist.

No style nits a linter or formatter already enforces. Findings are `suggestion`, or `important` when the repo's written rule is broken.
