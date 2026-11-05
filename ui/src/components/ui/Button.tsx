import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

// DESIGN.md: one filled primary button in view at a time. Controls are compact for mouse and
// trackpad and reach 44px on coarse pointers (touch-target). Icons are sized by the caller:
// size-3.5 next to `sm` text, size-4 next to `md`.
// The primary button is layered: ::after is its face (the fill and a light at the top), ::before a
// halo that grows in on hover, and the button itself carries the lift shadow. Hover is `enabled:`
// only, so a disabled one stays flat but still shows its title.
const PRIMARY = [
  'relative isolate font-medium text-primary-foreground shadow-sm transition-shadow duration-200 enabled:hover:shadow-lg',
  "after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-[inherit] after:bg-primary after:shadow-[var(--button-face-inset-shadow)] after:transition-[background-color,box-shadow] after:duration-200 after:content-['']",
  'enabled:hover:after:bg-primary/90 enabled:hover:after:shadow-[var(--button-face-inset-shadow-hover)]',
  "before:pointer-events-none before:absolute before:-inset-1 before:-z-10 before:scale-95 before:rounded-[calc(var(--radius-btn)+4px)] before:bg-primary/20 before:opacity-0 before:transition-all before:duration-200 before:ease-out before:content-['']",
  'enabled:hover:before:scale-100 enabled:hover:before:opacity-100 enabled:active:before:-inset-0.5',
].join(' ');

const VARIANTS: Record<ButtonVariant, string> = {
  primary: PRIMARY,
  secondary: 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700',
  ghost: 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
  danger: 'text-red-600 hover:bg-red-500/10 dark:text-red-400',
};
const SIZES: Record<ButtonSize, string> = {
  sm: 'gap-1 rounded-md [--radius-btn:var(--radius-md)] px-2 py-1 text-xs',
  md: 'gap-1.5 rounded-lg [--radius-btn:var(--radius-lg)] px-3 py-1.5 text-sm',
};

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...props }: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={cn('touch-target inline-flex items-center justify-center whitespace-nowrap disabled:opacity-50', VARIANTS[variant], SIZES[size], className)} {...props} />;
}
