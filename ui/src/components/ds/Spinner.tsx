import { cn } from '../../lib/utils';

// Something is under way where a mark has no room (a button, a line of text): the same turning arc as
// a running StatusMark, in the current text colour. Breathes instead under reduced motion.
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn('size-4 shrink-0', className)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <g className="mark-turn"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="10 28" /></g>
    </svg>
  );
}
