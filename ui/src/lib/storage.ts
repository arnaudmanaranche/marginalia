// localStorage may be unavailable or throw (private window, blocked site data): every access is guarded and
// the studio works without it.
export const KEY_PREFIX = 'mr-review-viewer:';

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// `null` forgets the key.
export function writeStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* the value lasts this page */ }
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = readStored(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export const writeJson = (key: string, value: unknown) => writeStored(key, JSON.stringify(value));
