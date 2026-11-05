import type { Finding } from '../../lib/api';
import { Badge } from '../ui/Badge';
import type { BadgeTone } from '../ui/badgeStyles';
import { cn } from '../../lib/utils';

type Level = Finding['severity'];

const TONE: Record<Level, BadgeTone> = { critical: 'danger', important: 'warning', suggestion: 'info', info: 'neutral' };
const DOT: Record<Level, string> = { critical: 'bg-fail', important: 'bg-warn', suggestion: 'bg-run', info: 'bg-idle' };

// How much a finding matters, said the same way everywhere: as a word on a badge where there is
// room, as a dot beside the title in a dense list (the title's screen-reader prefix carries the word).
export function SeverityBadge({ level, className }: { level: Level; className?: string }) {
  return <Badge tone={TONE[level]} className={className}>{level}</Badge>;
}

export function SeverityDot({ level, className }: { level: Level; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', DOT[level], className)} />;
}
