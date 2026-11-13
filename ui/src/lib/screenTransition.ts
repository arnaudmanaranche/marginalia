import { flushSync } from 'react-dom';

// Moving between screens carries what was clicked into what opens: a review's title in a Home row
// becomes the title of the review (and back), through the View Transitions API. Elements that show a
// review's title carry `data-vt-title={slug}`; the one on each side gets the shared name for the move.
const NAME = 'review-title';
// How long the old screen may stay frozen waiting for the new title; past that it just cross-fades.
const WAIT_MS = 300;

const isReview = (slug: string | null) => Boolean(slug?.includes('/'));

// Whose title moves from `from` to `to`: the review arrived at, else the review left; null between two
// pages (a plain cross-fade); undefined when the screen stays the same (a finding or a version changes).
export function sharedTitle(from: string | null, to: string | null): string | null | undefined {
  if (from === to) return undefined;
  if (isReview(to)) return to;
  return isReview(from) ? from : null;
}

const titleOf = (slug: string) => document.querySelector<HTMLElement>(`[data-vt-title="${CSS.escape(slug)}"]`);

function waitFor<T>(find: () => T | null, ms: number): Promise<T | null> {
  const end = performance.now() + ms;
  return new Promise((resolve) => {
    const tick = () => {
      const found = find();
      if (found || performance.now() > end) resolve(found);
      else setTimeout(tick, 16);
    };
    tick();
  });
}

// Applies the change of screen (`update`, a React state change) inside a view transition.
export function changeScreen(update: () => void, from: string | null, to: string | null) {
  const key = sharedTitle(from, to);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (key === undefined || still || typeof document.startViewTransition !== 'function' || document.visibilityState !== 'visible') {
    update();
    return;
  }
  const before = key ? titleOf(key) : null;
  if (before) before.style.viewTransitionName = NAME;
  let applied = false;
  const transition = document.startViewTransition(async () => {
    applied = true;
    if (before) before.style.viewTransitionName = '';
    flushSync(update);
    const after = before && key ? await waitFor(() => titleOf(key), WAIT_MS) : null;
    if (after) after.style.viewTransitionName = NAME;
  });
  // The browser runs the change once it paints a frame: if it has not within a moment (a tab that does not
  // paint), the move is dropped and the screen changes anyway, never left on the old one.
  setTimeout(() => {
    if (applied) return;
    transition.skipTransition();
    flushSync(update);
  }, 500);
  transition.finished.finally(() => {
    const shown = key ? titleOf(key) : null;
    if (shown) shown.style.viewTransitionName = '';
  });
}
