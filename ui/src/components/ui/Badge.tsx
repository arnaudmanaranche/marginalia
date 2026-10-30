import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';
import { badgeClass, type BadgeTone } from './badgeStyles';

// Text only: see badgeClass.
export function Badge({ tone, className, ...props }: ComponentProps<'span'> & { tone?: BadgeTone }) {
  return <span className={cn(badgeClass({ tone }), className)} {...props} />;
}
