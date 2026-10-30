# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers on one team who review each other's GitLab merge requests. The team runs one shared instance of marginalia on company infrastructure behind HTTPS, and signs in with GitLab. A single developer can also run it locally, as one user on `127.0.0.1`, to try it or to develop it.

Two jobs bring people to it. In the studio: an MR has been reviewed in the background, and they need to read the review, decide what is worth saying and say it on the MR. In GitLab: they want a review or an answer now, and they mention `@marginalia` on the MR. A recurring third job is triaging the comments other people left on their own MRs.

## Product Purpose

marginalia is a bot that runs reviews on GitLab merge requests, and a studio to read them. A review is requested from the studio or by mentioning `@marginalia` in an MR. The bot checks out the MR, lets an agent review it with whatever tools, sub-agents and skills it chooses, validates the result against a fixed contract, then shows it in the studio or replies on the MR.

Success:

- **Read a review quickly and well**: verdict, before/after, blocking points and reasoning understood in seconds, without opening raw markdown.
- **Post the right comment**: the proposed comment can be copied, edited and posted, with the person in control.
- **Triage feedback on their own MRs**: comments received on one's own merge requests are worked through efficiently.
- **Get an answer where the work is**: a mention in GitLab returns a review or an answer in the thread.

## Positioning

The contract is fixed, the method is free. The bot decides the shape of a review and refuses anything that does not fit it; the agent decides how to get there. Marginalia ships the contract skill and a small set of global skills (`pr-hygiene`, `correctness`, `security`, `tests`, `maintainability`, `compatibility`, `performance`) and accepts a team's own skills from the reviewed repo's `.claude/`, which win over the built-ins. The bot contains no knowledge of any stack.

**The bot only posts when a person asked for it**, by mentioning it or by clicking. A mention is the request, so the bot replies in the thread. From the studio, a person reads, edits and clicks, and the comment goes out under their own name. The bot never reviews and posts unprompted.

V2 reverses the 12 October 2026 decision to drop the mention bot. The reading experience stays the core and the mention is a second way in. See `docs/adr/0002-v2-supersedes-the-mention-bot-revert.md`.

## Operating Context

- Shared instance: Docker image, HTTPS, GitLab OAuth for the studio, a bot GitLab account for replies, SQLite on a persistent volume, one instance.
- Mentions arrive by webhook (`Note Hook`) where a Maintainer set it up, or by polling MR notes, which needs only Developer rights. Both feed the same intake.
- Claude Code CLI runs headless with one API key per instance, in an ephemeral git worktree per run. The agent's environment holds no GitLab token. Only `api/` holds the write token.
- Local mode: same code, one user, no OAuth, polling, the developer's own `claude` login. SwiftBar, autostart and desktop notifications are optional local helpers, not part of the core.
- Reviews arrive in bursts; a person typically returns to several at once, so the open set changes constantly and read/unread state matters.
- Keyboard layouts vary (QWERTY and AZERTY); shortcuts follow the typed character, not the physical key.

## Capabilities and Constraints

- A review follows the contract in `packages/contract`. Richer display (verdict, severity counts, before/after overview, tour, findings with a comment to post) comes from the contract itself; there is no "unrated" fallback for the contract path.
- Studio features: a Home that groups reviews by whose turn it is, tabs for reviews being read, a command palette, copy / edit / post of the proposed comment, a guided tour with a diff pane and a per-stop chat, live updates.
- Interface language is English. This is a binding requirement: no French in the UI.
- Reports may be long and contain unbroken paths and identifiers; they must never break the layout.
- Browsers reserve some shortcuts (⌘W cannot be intercepted); the studio uses Ctrl+W, ⌥W and ⌘⌥W to close a review tab.
- Stack: Node.js and TypeScript for `api/` (built with `tsc`), React + Vite + Tailwind for `ui/`, npm workspaces. Undecided: a manual light/dark switch (the theme follows the operating system today).

## Brand Commitments

- Name: **marginalia** (product and package), decided by the product owner.
- The studio speaks plainly and in English; no marketing tone.

## Evidence on Hand

- `api/examples/commands/` and `api/examples/agents/`: sample review and triage commands from V1.
- Real generated reviews from the author's own use exist on their machine (about thirty), used to develop the studio. They are not part of this repository.
- No usage data, customer testimonials or benchmarks exist. None should be invented.

## Product Principles

1. **Reading comes first.** The studio exists to make a long review quick to understand; everything else supports that. A review shows the before/after overview, plain-words chapters, and the core change first.
2. **Nothing is posted unasked.** Every post answers a mention or a click, is previewed, and for a click is editable first.
3. **The contract is fixed, the method is free.** Nothing may assume one repository, one stack or one review style, and nothing invalid is shown or posted.
4. **Untrusted input stays data.** MR titles, descriptions, diffs and comments never become instructions, and the agent cannot post.
5. **Robust to real reviews.** Long identifiers, empty sections and failed runs are normal input, not edge cases.

## Accessibility & Inclusion

Target standard: **WCAG 2.2 AA**, confirmed by the product owner. In practice: readable contrast in both light and dark themes, full keyboard operation, correct semantics for screen readers, reduced-motion support, and layouts that work on narrow screens.
