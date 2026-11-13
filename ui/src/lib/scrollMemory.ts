// Each history entry keeps how far its screen was scrolled, so Back and Forward return to it, whatever
// the screen change does in between (a view transition delays the new screen: the browser's own
// restoration would land before it). A new entry starts at the top.
//
// Positions are kept in memory, keyed by an id each entry carries in history.state, as the person
// scrolls: none is lost to a write still waiting. They are also written into history.state when
// scrolling settles, so a reload keeps them.
const ID = 'entry';
const Y = 'scrollY';
// Safari refuses more than ~100 history writes in 30s: the stored copy is written when scrolling stops.
const SETTLE_MS = 150;
// How long a restore waits for the screen to grow tall enough (content still loading); on a reload the
// first data takes longer to come.
const GROW_MS = 1000;
const LOAD_MS = 3000;

const positions = new Map<string, number>();
let timer = 0;
let next = 0;
let cancelRestore = () => {};
// The entry whose screen is shown: when the entry changes, its screen is still there to measure.
let shownId: string | null = null;

const state = () => (history.state ?? {}) as Record<string, unknown>;
const idOf = () => (typeof state()[ID] === 'string' ? (state()[ID] as string) : null);

function write(patch: Record<string, unknown>) {
  try {
    history.replaceState({ ...state(), ...patch }, '');
  } catch { /* too many writes: memory still has it */ }
}

// Gives the entry on screen an id, if it has none yet; returns it.
function claim(): string {
  const id = idOf() ?? `${Date.now().toString(36)}-${next++}`;
  if (!idOf()) write({ [ID]: id });
  return id;
}

// Remembers positions from now on; returns the way to stop.
export function rememberScroll(): () => void {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  shownId = claim();
  // A reload comes back where the entry was left.
  const stored = state()[Y];
  if (typeof stored === 'number') restore(stored, LOAD_MS);
  const onScroll = () => {
    const id = idOf();
    if (!id) return;
    positions.set(id, window.scrollY);
    clearTimeout(timer);
    // Written only into the entry it was measured on, should the entry change before it settles.
    timer = window.setTimeout(() => idOf() === id && write({ [Y]: positions.get(id) }), SETTLE_MS);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    clearTimeout(timer);
    cancelRestore();
    window.removeEventListener('scroll', onScroll);
  };
}

// Called as soon as the entry changes. `back`: the entry was seen before (Back or Forward), so it has
// a position to return to; a new entry (a link, a click) has none and starts at the top.
export function arrive(): { back: boolean; top: number } {
  clearTimeout(timer);
  cancelRestore();
  // The screen left is still on display: its position is read now, whatever scroll events are pending.
  if (shownId) positions.set(shownId, window.scrollY);
  const id = idOf();
  if (!id) {
    shownId = claim();
    return { back: false, top: 0 };
  }
  shownId = id;
  const stored = state()[Y];
  return { back: true, top: positions.get(id) ?? (typeof stored === 'number' ? stored : 0) };
}

// Scrolls to `top`, and keeps trying for a moment while the screen is still too short to reach it
// (content arriving after the screen change). A person scrolling meanwhile stops it.
export function restore(top: number, wait = GROW_MS) {
  cancelRestore();
  window.scrollTo({ top, behavior: 'instant' });
  if (top === 0 || Math.abs(window.scrollY - top) < 2) return;
  const end = performance.now() + wait;
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('keydown', stop);
  };
  const tick = () => {
    window.scrollTo({ top, behavior: 'instant' });
    if (Math.abs(window.scrollY - top) < 2 || performance.now() > end) stop();
    else frame = requestAnimationFrame(tick);
  };
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });
  window.addEventListener('keydown', stop);
  cancelRestore = stop;
  frame = requestAnimationFrame(tick);
}
