import { useLayoutEffect, useRef, useState } from 'react';
import { NoteMarkdown } from './NoteMarkdown';
import { cn } from '../lib/utils';

// A long explanation takes five lines and opens on click, so the findings under it stay in view.
// Whether it is long is read from the page, and again when the panel changes width.
export function ClampedNote({ children, className }: { children: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    // Only a clamped note can overflow: once open, the last answer stands.
    const measure = () => { if (!open) setLong(el.scrollHeight > el.clientHeight + 1); };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [children, open]);
  return (
    <div className={className}>
      <div ref={box} className={cn(!open && 'line-clamp-5')}>
        <NoteMarkdown className="text-[0.9375rem] leading-relaxed prose-p:my-1.5">{children}</NoteMarkdown>
      </div>
      {(long || open) && <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="mt-0.5 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">{open ? 'Show less' : 'Read more'}</button>}
    </div>
  );
}
