// Each history entry keeps how far its screen was scrolled (in history.state), so Back and Forward
// return to it, whatever the screen change does in between (a view transition delays the new screen:
// the browser's own restoration would land before it). A new entry starts at the top.
const KEY = 'scrollY';
// Writes are few: when scrolling stops, and just before a click or key may navigate away. Safari
// refuses more than ~100 history writes in 30s.
const SETTLE_MS = 150;

let timer = 0;

function saveNow() {
  clearTimeout(timer);
  try {
    history.replaceState({ ...(history.state ?? {}), [KEY]: window.scrollY }, '');
  } catch { /* too many writes: the position is kept next time */ }
}

// Remembers the position from now on; returns the way to stop.
export function rememberScroll(): () => void {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const later = () => {
    clearTimeout(timer);
    timer = window.setTimeout(saveNow, SETTLE_MS);
  };
  window.addEventListener('scroll', later, { passive: true });
  window.addEventListener('pointerdown', saveNow, true);
  window.addEventListener('keydown', saveNow, true);
  return () => {
    clearTimeout(timer);
    window.removeEventListener('scroll', later);
    window.removeEventListener('pointerdown', saveNow, true);
    window.removeEventListener('keydown', saveNow, true);
  };
}

// Where the screen just arrived at goes: its own position on Back or Forward, the top on a new entry.
// Read it as soon as the entry changes: a write still pending belongs to the screen left.
export function arrivalScroll(): number {
  clearTimeout(timer);
  const y = history.state?.[KEY];
  return typeof y === 'number' ? y : 0;
}
