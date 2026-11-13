import { useEffect, useState } from 'react';

// The design system's tooltip for icon-only controls: any element with `data-tip` shows it after a short
// pause on hover or keyboard focus, in the studio's style, instead of the browser's slow native title.
// One layer for the whole page (event delegation); the control keeps its aria-label for screen readers.
const DELAY_MS = 300;

interface Shown { text: string; x: number; y: number; below: boolean }

export function TipLayer() {
  const [tip, setTip] = useState<Shown | null>(null);
  useEffect(() => {
    let timer = 0;
    let current: HTMLElement | null = null;
    const hide = () => {
      clearTimeout(timer);
      current = null;
      setTip(null);
    };
    const show = (el: HTMLElement, delay: number) => {
      clearTimeout(timer);
      current = el;
      timer = window.setTimeout(() => {
        const text = el.dataset.tip;
        if (!text || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        // Below the control, unless it sits too low on screen.
        const below = r.bottom + 40 < window.innerHeight;
        setTip({ text, x: Math.min(Math.max(r.left + r.width / 2, 120), window.innerWidth - 120), y: below ? r.bottom + 6 : r.top - 6, below });
      }, delay);
    };
    const target = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>('[data-tip]') : null);
    const onOver = (e: PointerEvent) => {
      const el = target(e);
      if (el === current) return;
      if (el) show(el, DELAY_MS);
      else hide();
    };
    const onFocus = (e: FocusEvent) => {
      const el = target(e);
      if (el && (e.target as HTMLElement).matches(':focus-visible')) show(el, 0);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    document.addEventListener('pointerover', onOver);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    return () => {
      hide();
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);
  if (!tip) return null;
  return (
    <div role="tooltip" className={`pointer-events-none fixed z-[60] max-w-72 -translate-x-1/2 rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-lg shadow-black/20 motion-safe:animate-[fade-in_120ms_ease-out] ${tip.below ? '' : '-translate-y-full'}`} style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  );
}
