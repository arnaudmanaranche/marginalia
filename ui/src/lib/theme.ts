import { useEffect, useState } from 'react';

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

// The choice, kept and applied; while it is "system" a change of the OS theme is followed.
export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);
  useEffect(() => {
    applyTheme(choice);
    if (choice !== 'system' || typeof matchMedia !== 'function') return undefined;
    const query = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    query.addEventListener('change', on);
    return () => query.removeEventListener('change', on);
  }, [choice]);
  const set = (next: ThemeChoice) => {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch { /* the choice still applies for this page */ }
    setChoice(next);
  };
  return [choice, set];
}
