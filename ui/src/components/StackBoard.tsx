import { useState } from 'react';
import { AlertOctagon, CheckCircle2, ChevronDown, ChevronRight, CircleDashed, GitMerge, RefreshCw } from 'lucide-react';
import type { CrossFinding, ReviewItem, Stack, StackLayer } from '../lib/api';
import { cn } from '../lib/utils';
import { Badge } from './ui/Badge';
import type { BadgeTone } from './ui/badgeStyles';

const KIND: Record<CrossFinding['kind'], { label: string; tone: BadgeTone }> = {
  'settled-later': { label: 'Settled in a later layer', tone: 'neutral' },
  'belongs-lower': { label: 'Belongs in a lower layer', tone: 'danger' },
  'assumes-upper': { label: 'Assumes a later layer', tone: 'info' },
};

interface Row {
  layer: StackLayer;
  item: ReviewItem | undefined;
}

function VerdictIcon({ item }: { item: ReviewItem | undefined }) {
  if (item?.verdict === 'APPROVE') return <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="Approve" />;
  if (item?.verdict === 'REQUEST_CHANGES') return <AlertOctagon className="size-4 text-red-600 dark:text-red-400" aria-label="Request changes" />;
  return <CircleDashed className="size-4 text-zinc-400" aria-label="Not reviewed" />;
}

// The stack of the open review in one line: its layers bottom to top (the merge order), each with
// its verdict, which one this is, and whether the stack can merge. What crosses layers opens on
// demand: the review below is what the page is for.
export function StackBoard({ stack, items, current, isPosted, onSelect }: {
  stack: Stack;
  items: ReviewItem[];
  current: ReviewItem;
  isPosted: (i: ReviewItem) => boolean;
  onSelect: (slug: string) => void;
}) {
  const rows: Row[] = stack.layers.map((layer) => ({ layer, item: items.find((i) => i.slug === layer.slug) }));
  const byIid = new Map(rows.map((r) => [r.layer.iid, r]));
  // Closest layer below that isn't approved and current: it must land first.
  const blockedBy = (r: Row) => {
    for (let p = byIid.get(r.layer.parentIid ?? -1); p; p = byIid.get(p.layer.parentIid ?? -1)) {
      if (p.item?.verdict !== 'APPROVE' || p.item.stale) return p.layer;
    }
    return null;
  };
  const blocking = rows.filter((r) => r.item?.verdict === 'REQUEST_CHANGES').length;
  const waiting = rows.filter((r) => !r.item?.verdict || r.item.stale).length;
  const ready = blocking === 0 && waiting === 0;
  const here = rows.find((r) => r.item?.slug === current.slug);

  // Issues from this review, plus issues other layers raised about this one.
  const cross = [
    ...current.crossLayer.map((c) => ({ ...c, from: here?.layer.iid ?? null })),
    ...rows.filter((r) => r.item && r.item.slug !== current.slug).flatMap((r) => r.item!.crossLayer.filter((c) => c.iid === here?.layer.iid).map((c) => ({ ...c, from: r.layer.iid }))),
  ];
  const slugOf = (iid: number | null) => (iid === null ? null : byIid.get(iid)?.item?.slug ?? null);

  const [open, setOpen] = useState(false);
  const status = ready ? 'ready to merge' : [blocking && `${blocking} blocking`, waiting && `${waiting} not up to date`].filter(Boolean).join(', ');

  return (
    <section aria-label="Stack" className="border-b border-line bg-canvas px-6 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 font-medium" title={`Merge bottom to top, retargeting each MR to ${stack.baseBranch} once the one below has landed.`}>
          <GitMerge className="size-4 shrink-0 text-fg-subtle" aria-hidden />Stack on <code className="font-mono text-xs">{stack.baseBranch}</code>
        </span>
        {/* Bottom layer first: the order they merge in. */}
        <ol className="flex flex-wrap items-center gap-1" aria-label="Layers, bottom first">
          {rows.map((r, i) => {
            const active = r.item?.slug === current.slug;
            const by = blockedBy(r);
            const state = !r.item ? 'not reviewed yet' : r.item.stale ? 'review out of date' : isPosted(r.item) ? 'review posted' : 'reviewed';
            const label = <><VerdictIcon item={r.item} /><span className="font-mono text-xs">!{r.layer.iid}</span></>;
            const chip = cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5', active ? 'border-blue-500/60 bg-blue-500/10' : 'border-line hover:bg-sunken', r.item?.stale && 'border-dashed');
            const title = `${r.layer.title}: ${state}${by ? `, waits for !${by.iid}` : ''}`;
            return (
              <li key={r.layer.iid} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5 text-fg-subtle" aria-hidden />}
                {r.item && !active
                  ? <a href={`#/${r.item.slug}`} onClick={() => onSelect(r.item!.slug)} title={title} className={chip}>{label}</a>
                  : <span aria-current={active ? 'true' : undefined} title={title} className={chip}>{label}</span>}
              </li>
            );
          })}
        </ol>
        <span className={cn('text-xs', ready ? 'text-emerald-700 dark:text-emerald-300' : 'text-fg-muted')}>{status}</span>
        {cross.length > 0 && (
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="ml-auto inline-flex items-center gap-1 text-xs text-fg-muted hover:text-zinc-900 dark:hover:text-zinc-100">
            {cross.length} across layers<ChevronDown className={cn('size-3.5 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
          </button>
        )}
      </div>

      {current.stale && (
        <p role="status" className="mt-2 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
          <RefreshCw className="size-3.5 shrink-0" aria-hidden />
          This review predates new commits on this layer or the one below. It is re-run on the next poll, lower layers first.
        </p>
      )}

      {open && (
        <ul className="mt-3 space-y-2 border-t border-line pt-3">
          {cross.map((c, i) => {
            const other = c.from === here?.layer.iid ? c.iid : c.from;
            const slug = slugOf(other);
            return (
              <li key={i} className="flex gap-3">
                <Badge tone={KIND[c.kind].tone} className="h-fit shrink-0">{KIND[c.kind].label}</Badge>
                <div className="min-w-0 flex-1">
                  <p className={cn('break-words [overflow-wrap:anywhere]', c.kind === 'settled-later' && 'text-fg-muted')}>{c.text}</p>
                  {other !== null && (
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {c.from === here?.layer.iid ? 'Concerns' : 'Raised by'}{' '}
                      {slug ? <a href={`#/${slug}`} onClick={(e) => { e.preventDefault(); onSelect(slug); }} className="text-blue-600 hover:underline dark:text-blue-400">!{other}</a> : `!${other}`}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
