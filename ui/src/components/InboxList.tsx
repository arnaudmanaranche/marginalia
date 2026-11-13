import { useEffect, useRef } from 'react';
import type { Proposal } from '../lib/approvalsApi';
import { byMergeRequest } from '../lib/approvalsApi';
import { keyOf } from '../lib/inbox';
import { cn } from '../lib/utils';
import { SeverityDot } from './ds/Severity';

// The inbox's list: proposals under their MR, one line each (how much it matters, what, where), the
// selected one marked in the signal blue and kept in view as the keys move through it.
export function InboxList({ proposals, selected, onSelect }: { proposals: Proposal[]; selected: string | null; onSelect: (key: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  return (
    <div ref={box} className="space-y-4">
      {byMergeRequest(proposals).map((group) => {
        const first = group[0];
        return (
          <section key={first.slug} aria-label={first.mrTitle}>
            <h2 className="flex items-baseline gap-2 px-2 pb-1 text-xs">
              {/* The MR opens its review here; its number opens it on GitLab. */}
              <a href={`#/${first.slug}`} title={`Open the review of ${first.mrTitle}`} className="min-w-0 truncate font-medium hover:underline">{first.mrTitle}</a>
              <span className="shrink-0 tabular-nums text-fg-muted">
                {first.webUrl ? <a href={first.webUrl} target="_blank" rel="noreferrer" title="Open the MR on GitLab" className="hover:text-fg hover:underline">!{first.iid}</a> : `!${first.iid}`} · {group.length}
              </span>
            </h2>
            <ul className="space-y-px">
              {group.map((p) => {
                const on = keyOf(p) === selected;
                return (
                  <li key={p.findingId}>
                    <button
                      type="button" aria-current={on ? 'true' : undefined} onClick={() => onSelect(keyOf(p))}
                      className={cn('touch-target flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150', on ? 'bg-run/10 ring-1 ring-inset ring-run/40' : 'hover:bg-sunken/60')}
                    >
                      <SeverityDot level={p.severity} className="mt-1.5" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate"><span className="sr-only">{p.severity}: </span>{p.title}</span>
                        {p.path && <code className="block truncate font-mono text-[11px] leading-4 text-fg-muted">{p.path.split('/').pop()}{p.line ? `:${p.line}` : ''}</code>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
