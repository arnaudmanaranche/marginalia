import { useState } from 'react';
import { NoteMarkdown } from './NoteMarkdown';
import { cn } from '../lib/utils';

// A long explanation takes five lines and opens on click, so the findings under it stay in view.
export function ClampedNote({ children, className, lines = 5 }: { children: string; className?: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  // Roughly 90 characters a line in the panel: shorter text never needs the button.
  const long = children.length > lines * 90;
  return (
    <div className={className}>
      <NoteMarkdown className={cn('text-[0.9375rem] leading-relaxed prose-p:my-1.5', !open && long && 'line-clamp-5')}>{children}</NoteMarkdown>
      {long && <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="mt-0.5 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">{open ? 'Show less' : 'Read more'}</button>}
    </div>
  );
}
