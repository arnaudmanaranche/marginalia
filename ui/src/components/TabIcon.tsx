import { VERDICT_ICON } from '../lib/verdictIcons';
import type { ReviewItem } from '../lib/api';
import { cn } from '../lib/utils';
import { StatusMark } from './ds/StatusMark';

export type BotState = 'pending' | 'reviewing' | 'failed' | 'skipped' | 'up_to_date' | undefined;

// What the bot is doing with this review, shown before the verdict so live
// work is visible at a glance: running, waiting, or broken.
export function TabIcon({ item, bot }: { item: ReviewItem; bot: BotState }) {
  // Run states are the design system's marks, the same as in the queue and the jobs.
  if (bot === 'reviewing') return <StatusMark state="running" label="Review in progress" />;
  if (bot === 'failed') return <StatusMark state="failed" label="Review failed" />;
  if (bot === 'pending') return <StatusMark state="pending" label="Waiting for review" />;
  const { Icon, cls } = VERDICT_ICON[item.verdict ?? 'OTHER'];
  return <Icon className={cn('size-4 shrink-0', cls)} aria-hidden />;
}

