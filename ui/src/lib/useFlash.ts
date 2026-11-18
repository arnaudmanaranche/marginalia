import { useCallback, useEffect, useRef, useState } from 'react';

// Something lit for a moment: `flash(value)` shows it, and it goes out after `ms`.
export function useFlash<T = true>(ms: number) {
  const [value, setValue] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = useCallback((next: T = true as T) => {
    clearTimeout(timer.current);
    setValue(next);
    timer.current = setTimeout(() => setValue(null), ms);
  }, [ms]);
  return [value, flash] as const;
}

// A copy button's "Copied" that goes back to "Copy" after a moment.
export function useCopied(ms = 1500) {
  const [copied, flash] = useFlash(ms);
  return [copied === true, flash] as const;
}
