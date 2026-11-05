# Guidelines: `ui/`

Applies to the studio (`ui/`). How it looks is in `DESIGN.md`; the words it uses are in `GLOSSARY.md`.

## Data

- The UI reads and writes only through the typed client in one place (`ui/src/api`). Components never call `fetch`.
- Types and parsing come from `packages/contract`. The UI never imports from `api/`; a lint rule enforces it.
- Server state lives in a query cache. Local state stays in the component that owns it.

## Components

- `components/` for pieces, `lib/` for pure helpers, one Storybook story for every presentational component.
- A component file may not exceed **200 lines** (same check script as `api/`). Split by responsibility, not by compacting.
- Props are typed; no `any`. A component does one job.

## Words

- Labels and copy use the glossary terms and only those: Review, Finding, Tour, Run, Mention, Post. Never rename them in the UI.
- English only, plain tone, no marketing. No French anywhere in the UI.

## Accessibility

- Target WCAG 2.2 AA. Every interactive element is reachable and operable by keyboard.
- Shortcuts follow the typed character, not the physical key (QWERTY and AZERTY both in use).
- Respect reduced motion. Semantics for screen readers are correct, not decorative.

## States

Every view handles loading, empty, error and live-update states. Long unbroken paths and identifiers never break the layout. A failed run is shown with its reason, not as a blank review.

## Less is more

Review by exception: the agent proposes, the human decides. Do not add text or controls without removing some. The review page stays minimal.

## Verification

A change to the UI is checked in a running studio. `npm run typecheck`, `npm test` and the Storybook build pass before a commit. Studio changes need the UI build before the server shows them.
