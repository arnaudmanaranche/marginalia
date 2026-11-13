import { useEffect, useSyncExternalStore } from 'react';

// The studio's theme: follow the system, or be light or dark whatever the system says. The result is
// written on <html> as data-theme, which the stylesheet reads (index.css); the choice is kept in this
// browser only, a per-viewer convenience (index.html applies it before the first paint).
export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'marginalia:theme';
export const CHOICES: { id: ThemeChoice; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export const parseChoice = (raw: unknown): ThemeChoice => (raw === 'light' || raw === 'dark' ? raw : 'system');
export const resolveTheme = (choice: ThemeChoice, systemDark: boolean): Theme => (choice === 'system' ? (systemDark ? 'dark' : 'light') : choice);

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

export function readChoice(): ThemeChoice {
  try {
    return parseChoice(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

export function applyTheme(choice: ThemeChoice) {
  document.documentElement.dataset.theme = resolveTheme(choice, systemDark());
}

// One shared state: the Settings control and the rest of the app (the toaster) see the same choice.
const EVENT = 'marginalia:theme';

function subscribe(notify: () => void) {
  const on = () => {
    applyTheme(readChoice());
    notify();
  };
  window.addEventListener(EVENT, on);
  window.addEventListener('storage', on);
  const query = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  query?.addEventListener('change', on);
  return () => {
    window.removeEventListener(EVENT, on);
    window.removeEventListener('storage', on);
    query?.removeEventListener('change', on);
  };
}

export function setChoice(next: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch { /* the choice still applies for this page */ }
  switchSmoothly(() => window.dispatchEvent(new Event(EVENT)));
}

// The page cross-fades from one theme to the other (index.css) instead of flipping, where the browser
// can and motion is welcome; colour transitions wait, so no part lags behind. Otherwise it just switches.
function switchSmoothly(apply: () => void) {
  const root = document.documentElement;
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('theme-switching');
  const done = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
  if (still || typeof document.startViewTransition !== 'function') {
    apply();
    done();
    return;
  }
  document.startViewTransition(apply).finished.finally(done);
}

// The choice, kept and applied; while it is "system" a change of the OS theme is followed.
export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribe, readChoice, () => 'system' as ThemeChoice);
  useEffect(() => applyTheme(choice), [choice]);
  return [choice, setChoice];
}
