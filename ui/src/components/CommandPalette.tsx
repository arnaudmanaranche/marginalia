import { useEffect, useRef } from 'react';
import { Command } from 'cmdk';
import { ArrowRight, FileText } from 'lucide-react';
import type { ReviewItem } from '../lib/api';
import { useScrollLock } from '../lib/useScrollLock';
import { useModalFocus } from '../lib/useModalFocus';
import { VerdictBadge } from './VerdictBadge';
import type { PalettePage } from '../lib/palettePages';

// What kind of work a review is, when it is not a review of someone's MR: one MR can have both (GLOSSARY).
const KIND: Partial<Record<ReviewItem['kind'], string>> = { own: 'Own review', comments: 'Triage' };

const ITEM = 'touch-target flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-sunken';
const GROUP = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-muted';

// Goes to any screen (`pages`) or any review, by what a person types. `onSelect(null)` is Home.
export function CommandPalette({ open, setOpen, items, pages, onSelect }: { open: boolean; setOpen: (o: boolean) => void; items: ReviewItem[]; pages: PalettePage[]; onSelect: (route: string | null) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useScrollLock(open);
  useModalFocus(open, dialogRef, { initial: 'input' });

  if (!open) return null;
  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[15vh]" onClick={() => setOpen(false)}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Go to a screen or a review" className="w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
      <Command
        label="Go to a screen or a review"
        className="w-full overflow-hidden rounded-xl border border-line bg-surface shadow-2xl transition-shadow focus-within:border-run focus-within:ring-2 focus-within:ring-run/40 dark:focus-within:border-run"
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        <Command.Input placeholder="Screen, project, MR, title, branch, author…" className="w-full border-b border-line bg-transparent px-4 py-3 text-sm outline-none" />
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-fg-muted">No results</Command.Empty>
          <Command.Group heading="Go to" className={GROUP}>
            {pages.map((p) => (
              <Command.Item key={p.route ?? 'home'} value={`page ${p.label}`} keywords={p.keywords} onSelect={() => { onSelect(p.route); setOpen(false); }} className={ITEM}>
                <ArrowRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{p.label}<span className="ml-2 text-xs text-fg-muted">{p.hint}</span></span>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Reviews" className={GROUP}>
          {items.map((it) => (
            <Command.Item
              key={it.slug}
              value={`${it.iid ?? ''} ${it.title} ${it.branch ?? ''} ${it.author ?? ''} ${KIND[it.kind] ?? ''} ${it.slug}`}
              onSelect={() => {
                onSelect(it.slug);
                setOpen(false);
              }}
              className={ITEM}
            >
              <FileText className="size-4 shrink-0 text-fg-subtle" />
              <span className="min-w-0 flex-1 truncate">{it.iid ? <span className="mr-2 font-mono text-xs text-fg-muted">!{it.iid}</span> : null}{it.title}</span>
              {KIND[it.kind] && <span className="shrink-0 rounded-md bg-sunken px-1.5 text-xs text-fg-muted">{KIND[it.kind]}</span>}
              {it.kind !== 'comments' && <VerdictBadge verdict={it.verdict} />}
            </Command.Item>
          ))}
          </Command.Group>
        </Command.List>
      </Command>
      </div>
    </div>
  );
}
