import { ChevronRight } from 'lucide-react';
import type { ReviewItem } from '../lib/api';
import type { Group } from '../lib/dashboard';
import { ReviewRow } from './ReviewRow';
import { Badge } from './ui/Badge';

function Heading({ group }: { group: Group }) {
  return (
    <>
      <span className="font-medium">{group.title}</span>
      <Badge tone={group.needsYou ? 'info' : 'neutral'} className="tabular-nums">{group.items.length}</Badge>
      <span className="hidden text-xs font-normal text-fg-muted sm:inline">{group.hint}</span>
    </>
  );
}

interface RowState {
  isUnread: (i: ReviewItem) => boolean;
  isReviewing: (i: ReviewItem) => boolean;
  // Came into the queue while the page was open.
  isNew: (i: ReviewItem) => boolean;
  // Several projects are watched: each row says which one it is from.
  showProject?: boolean;
}

function List({ group, isUnread, isReviewing, isNew, showProject }: { group: Group } & RowState) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
      {group.items.map((i) => <ReviewRow key={i.slug} item={i} unread={isUnread(i)} reviewing={isReviewing(i)} arrived={isNew(i)} showProject={showProject} />)}
    </ul>
  );
}

// The reviews grouped by whose turn it is. What waits on you comes first; what is done is folded.
export function ReviewGroups({ groups, ...row }: { groups: Group[] } & RowState) {
  return (
    <div className="mt-6 space-y-8">
      {groups.map((g) => (g.collapsed ? (
        <details key={g.id} className="group">
          <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 text-sm">
            <ChevronRight className="size-4 text-fg-subtle transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
            <Heading group={g} />
          </summary>
          <List group={g} {...row} />
        </details>
      ) : (
        <section key={g.id} aria-label={g.title}>
          <h2 className="mb-3 flex items-center gap-2 text-sm"><Heading group={g} /></h2>
          <List group={g} {...row} />
        </section>
      )))}
    </div>
  );
}
