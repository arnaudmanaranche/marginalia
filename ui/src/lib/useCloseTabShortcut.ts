import { useEffect, useRef } from 'react';

// Close the active review tab like a browser tab. ⌘W is reserved by the browser (a page never
// receives it), so the working shortcuts are Ctrl+W, ⌥W and ⌘⌥W; plain ⌘W is handled too in case
// it is ever delivered. The "W" is the character typed, not the physical position, so it also works
// on AZERTY (where that key sits where QWERTY has Z). Ignored while typing.
export function useCloseTabShortcut(slug: string | null, palette: boolean, close: (slug: string) => void) {
  // Physical key that types "w" on the current layout (AZERTY: KeyZ), used
  // for Option combos where e.key is a symbol. Chromium only; else e.key alone.
  const wCode = useRef<string | null>(null);
  useEffect(() => {
    const kb = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
    kb?.getLayoutMap?.().then((map) => {
      for (const [code, ch] of map) if (ch === 'w') wCode.current = code;
    }).catch(() => {});
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isW = e.key.toLowerCase() === 'w' || e.key === '∑' || (wCode.current !== null && e.code === wCode.current);
      if (!isW || e.shiftKey || !(e.ctrlKey || e.metaKey || e.altKey) || !slug) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (palette || document.querySelector('[role=dialog]')) return;
      e.preventDefault();
      close(slug);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
}
