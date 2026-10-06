import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import type { BotStatus, ReviewItem } from '../lib/api';
import { cn, timeAgo } from '../lib/utils';

// What the run is doing right now, for the MR on screen.
function LiveRun({ live }: { live: NonNullable<BotStatus['current']> }) {
  const steps = live.progress ?? [];
  return (
    <section aria-live="polite">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
        <Loader2 className="size-3 animate-spin motion-reduce:animate-pulse" aria-hidden />Running now
      </h2>
      {steps.length ? (
        <ol className="space-y-1 text-xs text-fg-muted">
          {steps.map((s, i) => (
            <li key={`${i}-${s}`} className={cn('break-words', i === steps.length - 1 && 'font-medium text-zinc-900 dark:text-zinc-100')}>{s}</li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-fg-muted">Starting…</p>
      )}
    </section>
  );
}

// Side panel: context that stays visible while reading. Collapses to give the article the room.
export function ReaderSidePanel({ item, live, open, projectUrl, jiraBaseUrl, ticket, sections, allOpen, onToggleAll, onJump }: {
  item: ReviewItem | undefined;
  live: BotStatus['current'];
  open: boolean;
  projectUrl: string | null;
  jiraBaseUrl: string | null;
  ticket: { key: string; note: string | null } | null;
  sections: { id: string; title: string }[];
  allOpen: boolean;
  onToggleAll: () => void;
  onJump: (id: string) => void;
}) {
  return (
  <aside
    aria-label="Review details"
    aria-hidden={!open}
    className={cn('sticky top-[calc(var(--chrome-h)+1rem)] hidden h-[calc(100vh-var(--chrome-h)-2rem)] shrink-0 self-start overflow-hidden transition-[width,opacity] duration-300 ease-out motion-reduce:transition-none lg:block', open ? 'w-64 opacity-100' : 'w-0 opacity-0')}
  >
    <div className="flex h-full w-64 flex-col gap-5 overflow-y-auto pr-1 text-sm">
      {live && <LiveRun live={live} />}
      <DetailsSection item={item} projectUrl={projectUrl} jiraBaseUrl={jiraBaseUrl} ticket={ticket} />
      <ContentsSection slug={item?.slug} open={open} sections={sections} allOpen={allOpen} onToggleAll={onToggleAll} onJump={onJump} />
    </div>
  </aside>
  );
}

const LINK = 'text-blue-600 hover:underline dark:text-blue-400';

function BranchRow({ branch, projectUrl }: { branch: string; projectUrl: string | null }) {
  return (
    <Row label="Branch">
      <span className="break-all font-mono text-xs">
        {projectUrl ? <a className={LINK} href={`${projectUrl}/-/tree/${encodeURIComponent(branch).replace(/%2F/g, '/')}`} target="_blank" rel="noreferrer">{branch}</a> : branch}
      </span>
    </Row>
  );
}

function TicketRow({ ticketKey, note, jiraBaseUrl }: { ticketKey: string; note: string | null; jiraBaseUrl: string | null }) {
  return (
    <Row label="Ticket">
      <span title={note ?? undefined}>
        {jiraBaseUrl ? <a className={LINK} href={`${jiraBaseUrl}/browse/${encodeURIComponent(ticketKey)}`} target="_blank" rel="noreferrer">{ticketKey}</a> : ticketKey}
      </span>
    </Row>
  );
}

function DetailsSection({ item, projectUrl, jiraBaseUrl, ticket }: { item: ReviewItem | undefined; projectUrl: string | null; jiraBaseUrl: string | null; ticket: { key: string; note: string | null } | null }) {
  const ticketKey = item?.jira?.key ?? ticket?.key;
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">Details</h2>
      <dl className="space-y-1.5">
        {item?.iid && <Row label="Merge request">{item.webUrl ? <a className={LINK} href={item.webUrl} target="_blank" rel="noreferrer">!{item.iid}</a> : `!${item.iid}`}</Row>}
        {item?.author && <Row label="Author">{item.author}</Row>}
        {item?.branch && <BranchRow branch={item.branch} projectUrl={projectUrl} />}
        {ticketKey && <TicketRow ticketKey={ticketKey} note={ticket?.note ?? null} jiraBaseUrl={jiraBaseUrl} />}
        {item && <Row label="Reviewed">{timeAgo(item.reviewedAt)}</Row>}
        {item && <Row label="Findings">{item.critical} critical · {item.important} important</Row>}
      </dl>
    </section>
  );
}

function ContentsSection({ slug, open, sections, allOpen, onToggleAll, onJump }: { slug: string | undefined; open: boolean; sections: { id: string; title: string }[]; allOpen: boolean; onToggleAll: () => void; onJump: (id: string) => void }) {
  return (
    <section className="min-h-0">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-fg-muted">
        <h2 className="font-medium">Contents</h2>
        <button className="normal-case hover:text-zinc-900 dark:hover:text-zinc-100" tabIndex={open ? 0 : -1} onClick={onToggleAll}>{allOpen ? 'Collapse all' : 'Expand all'}</button>
      </div>
      <ul className="space-y-0.5">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#/${slug}`}
              tabIndex={open ? 0 : -1}
              onClick={(e) => {
                e.preventDefault();
                onJump(s.id);
              }}
              className="block truncate rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
