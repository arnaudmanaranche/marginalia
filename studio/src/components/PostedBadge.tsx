import type { PostedInfo } from '../lib/api';
import { cn, timeAgo } from '../lib/utils';
import { Badge } from './ui/Badge';
import { badgeClass } from './ui/badgeStyles';

// Where a comment stands on GitLab: in the pending review, or published (with a link to it).
export function PostedBadge({ info, className }: { info: PostedInfo | undefined; className?: string }) {
  if (!info) return null;
  if (info.pending) return <Badge tone="neutral" className={className}>Adding to review…</Badge>;
  if (info.state === 'draft') return <Badge tone="warning" className={className}>In pending review</Badge>;
  return (
    <a href={info.url} target="_blank" rel="noreferrer" title="Open on GitLab" className={cn(badgeClass({ tone: 'success' }), 'hover:underline', className)}>
      Posted {timeAgo(info.at)}
    </a>
  );
}
