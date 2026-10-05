import { Children, createElement, isValidElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import * as Collapsible from '@radix-ui/react-collapsible';
import { SemanticText } from 'semfont';
import { toast } from 'sonner';
import { useScrollLock } from '../lib/useScrollLock';
import { usePersistentState } from '../lib/layout';
import { useModalFocus } from '../lib/useModalFocus';
import { createContext } from 'react';
import { Check, ChevronRight, Copy, Trash2, X, ExternalLink, Loader2, PanelRight, Pencil, Send, Sparkles, Undo2 } from 'lucide-react';
import { deleteDraft, fetchDrafts, postComment, updateDraft, submitReview, type DraftNote, BotStatus, type PostedInfo, type ReviewItem } from '../lib/api';
import { cn, timeAgo } from '../lib/utils';
import { VerdictBadge } from './VerdictBadge';
import { LinkContext, commentLocation, linkify, linkifyCode, type LinkContextValue } from '../lib/links';

interface Section {
  id: string;
  title: string;
  body: string;
}

const OPEN_BY_DEFAULT = /critical|important|verdict|summary|blocking|bloquant|statut|status/i;

function slugify(s: string) {
  return s.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'section';
}

// Splits on "## " / "### " headings, ignoring fenced code blocks.
function splitSections(md: string): { intro: string; sections: Section[] } {
  const lines = md.split('\n');
  const sections: Section[] = [];
  let intro: string[] = [];
  let cur: { title: string; lines: string[] } | null = null;
  let fence = false;
  const flush = () => {
    if (!cur) return;
    sections.push({ id: `${slugify(cur.title)}-${sections.length}`, title: cur.title, body: cur.lines.join('\n') });
  };
  for (const line of lines) {
    if (/^```/.test(line)) fence = !fence;
    const h = !fence && line.match(/^#{2,3}\s+(.+)$/);
    if (h) {
      flush();
      cur = { title: h[1].replace(/[*`]/g, ''), lines: [] };
    } else if (cur) cur.lines.push(line);
    else intro.push(line);
  }
  flush();
  return { intro: intro.join('\n'), sections };
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

function CopyButton({ getText, label }: { getText: () => string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
          setDone(true);
          setTimeout(() => setDone(false), 1500);
          toast.success('Comment copied to clipboard');
        } catch {
          toast.error('Could not copy: clipboard access was denied');
        }
      }}
      className="touch-target inline-flex items-center justify-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
    >
      {done ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      {done ? 'Copied' : label}
    </button>
  );
}

// Edits survive collapsing a section or reloading; keyed by the original text.
const editKey = (original: string) => {
  let h = 0;
  for (let i = 0; i < original.length; i += 1) h = (h * 31 + original.charCodeAt(i)) | 0;
  return `mr-review-viewer:edit:${h}`;
};
const readEdit = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeEdit = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

interface PostContextValue {
  allowPosting: boolean;
  slug: string | null;
  iid: string | number | null;
  posted: Record<string, PostedInfo>;
  reload: () => void;
}
const PostContext = createContext<PostContextValue>({ allowPosting: false, slug: null, iid: null, posted: {}, reload: () => {} });
// The markdown a blockquote's `position.start.offset` refers to (one section body, not the whole review).
const SourceContext = createContext('');

// The "**Comment to post:**" line before a blockquote: the card already carries that label.
const COMMENT_LABEL = /^comment to post\s*:?$/i;

// Nothing is sent until "Add to review" is clicked here, with the final text.
function ConfirmPost({ iid, text, target, onCancel, onConfirm, fallbackRef }: { iid: string | number; text: string; target: { path: string; line?: number } | null; onCancel: () => void; onConfirm: () => Promise<void>; fallbackRef: RefObject<HTMLElement | null> }) {
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useScrollLock(true);
  // Focus moves to Cancel (the safe choice), stays inside, and returns to the opener on close.
  useModalFocus(true, dialogRef, { initial: '[data-autofocus]', fallback: fallbackRef });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={busy ? undefined : onCancel}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-post-title" aria-describedby="confirm-post-text" className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-post-title" className="text-base font-semibold">Add this comment to your review of !{iid}?</h2>
        <p className="mt-1 text-sm text-fg-muted">It joins your pending GitLab review: nobody sees it until you submit the review.</p>
        <p className="mt-1 text-sm text-fg-muted">
          {target ? <>Anchored on <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.85em] dark:bg-zinc-800">{target.path}{target.line ? `:${target.line}` : ''}</code> in the diff{target.line ? '' : ' (whole file)'}.</> : 'No file found above it: it will be a general comment.'}
        </p>
        <pre id="confirm-post-text" tabIndex={0} aria-label="Comment text" className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">{text}</pre>
        <div className="mt-4 flex justify-end gap-2">
          <button data-autofocus disabled={busy} onClick={onCancel} className="touch-target rounded-lg border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Cancel</button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } catch (e) {
                toast.error('Could not add the comment', { description: (e as Error).message });
                setBusy(false);
              }
            }}
            className="touch-target inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" /> : <Send className="size-4" />}Add to review
          </button>
        </div>
      </div>
    </div>
  );
}

// One pending draft: read, edit in place, or delete. Goes straight to GitLab's draft notes.
function DraftRow({ slug, draft, disabled, onChanged }: { slug: string; draft: DraftNote; disabled: boolean; onChanged: (next: DraftNote | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.body);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast.error(failure, { description: (e as Error).message });
    }
    setBusy(false);
  };
  const btn = 'touch-target inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-zinc-200/60 disabled:opacity-50 dark:hover:bg-zinc-800';
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-2">
        <code className="min-w-0 break-all text-xs text-fg-muted">{draft.path ? `${draft.path}${draft.line ? `:${draft.line}` : ''}` : 'General comment'}</code>
        <span className="flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              <button disabled={busy || disabled || !text.trim()} className={btn} onClick={() => run(async () => { await updateDraft(slug, draft.id, text.trim()); onChanged({ ...draft, body: text.trim() }); setEditing(false); }, 'Could not update the draft')}>
                <Check className="size-3.5" />Save
              </button>
              <button disabled={busy} className={btn} onClick={() => { setText(draft.body); setEditing(false); }}>
                <X className="size-3.5" />Cancel
              </button>
            </>
          ) : (
            <>
              <button disabled={busy || disabled} className={btn} onClick={() => setEditing(true)} aria-label="Edit this draft"><Pencil className="size-3.5" />Edit</button>
              <button disabled={busy || disabled} className={cn(btn, 'text-red-600 dark:text-red-400')} onClick={() => run(async () => { await deleteDraft(slug, draft.id); onChanged(null); }, 'Could not delete the draft')} aria-label="Delete this draft">
                <Trash2 className="size-3.5" />Delete
              </button>
            </>
          )}
        </span>
      </div>
      {editing ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(10, Math.max(3, text.split('\n').length + 1))} aria-label="Draft text" className="mt-2 w-full resize-y rounded-md border border-zinc-300 bg-white p-2 text-sm outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-900" />
      ) : (
        <p className="mt-1 whitespace-pre-wrap">{draft.body}</p>
      )}
    </div>
  );
}

// Publishes the pending review: every draft comment of this MR, plus an optional summary.
function ConfirmSubmit({ slug, iid, count, reload, onCancel, onConfirm }: { slug: string; reload: () => void; iid: string | number; count: number; onCancel: () => void; onConfirm: (summary: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState('');
  // Read from GitLab itself, so drafts started in its own UI are listed too.
  const [drafts, setDrafts] = useState<DraftNote[] | null>(null);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetchDrafts(slug).then((d) => live && setDrafts(d), (e) => live && setDraftsError((e as Error).message));
    return () => {
      live = false;
    };
  }, [slug]);
  const dialogRef = useRef<HTMLDivElement>(null);
  useScrollLock(true);
  useModalFocus(true, dialogRef, { initial: '[data-autofocus]' });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={busy ? undefined : onCancel}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-submit-title" className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-submit-title" className="text-base font-semibold">Submit your review of !{iid}?</h2>
        <p className="mt-1 text-sm text-fg-muted">{count} pending comment{count === 1 ? '' : 's'} will be published as one review, under your account and visible to the MR author. Drafts started in GitLab itself are published too.</p>
        <div className="mt-3 max-h-60 space-y-2 overflow-y-auto" aria-label="Pending comments" aria-busy={!drafts && !draftsError}>
          {draftsError && <p className="text-sm text-red-600 dark:text-red-400">Could not load the drafts: {draftsError}</p>}
          {!drafts && !draftsError && <p className="text-sm text-fg-muted">Loading…</p>}
          {drafts?.length === 0 && <p className="text-sm text-fg-muted">No pending comment on GitLab.</p>}
          {drafts?.map((d) => (
            <DraftRow key={d.id} slug={slug} draft={d} disabled={busy} onChanged={(next) => { setDrafts((all) => (all ?? []).flatMap((x) => (x.id !== d.id ? [x] : next ? [next] : []))); reload(); }} />
          ))}
        </div>
        <label htmlFor="review-summary" className="mt-3 block text-sm font-medium">Summary <span className="font-normal text-fg-muted">(optional)</span></label>
        <textarea id="review-summary" data-autofocus value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} className="mt-1 w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-900" />
        <div className="mt-4 flex justify-end gap-2">
          <button disabled={busy} onClick={onCancel} className="touch-target rounded-lg border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Cancel</button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(summary);
              } catch (e) {
                toast.error('Could not submit the review', { description: (e as Error).message });
                setBusy(false);
              }
            }}
            className="touch-target inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" /> : <Send className="size-4" />}Submit review
          </button>
        </div>
      </div>
    </div>
  );
}

// The "**Comment to post:**" blockquotes are meant to be pasted into GitLab:
// copy as is, or edit first in a textarea (the edit is kept locally).
function Quote({ children, offset }: { children?: ReactNode; offset?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [original, setOriginal] = useState(() => textOf(children).trim());
  const key = editKey(original);
  const [edited, setEdited] = useState<string | null>(() => readEdit(key));
  const [editing, setEditing] = useState(false);
  const current = edited ?? ref.current?.innerText.trim() ?? original;
  const post = useContext(PostContext);
  const source = useContext(SourceContext);
  const commentId = key.split(':').pop() ?? '';
  const postedInfo = post.slug ? post.posted[`${post.slug}:${commentId}`] : undefined;
  const [confirming, setConfirming] = useState(false);
  // The file:line the review mentions just above this comment, since the last heading.
  const target = useMemo(() => {
    if (offset === undefined) return null;
    const above = source.slice(0, offset);
    return commentLocation(above.slice(Math.max(above.lastIndexOf('\n#'), 0)));
  }, [source, offset]);
  // Focus lands here if the button that opened the dialog is gone (a posted comment replaces it).
  const rootRef = useRef<HTMLDivElement>(null);

  const startEdit = () => {
    const text = ref.current?.innerText.trim() ?? original;
    setOriginal((o) => o || text);
    setEdited((e) => e ?? text);
    setEditing(true);
  };
  const update = (v: string) => {
    setEdited(v);
    writeEdit(key, v);
  };
  const reset = () => {
    setEdited(null);
    writeEdit(key, null);
    setEditing(false);
    toast('Reverted to the generated comment');
  };

  return (
    <div ref={rootRef} tabIndex={-1} className="not-prose my-4 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 focus:outline-none">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">
        <span>
          Comment to post{edited !== null && !editing ? ' · edited' : ''}
          {postedInfo?.state === 'draft' && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 normal-case tracking-normal text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300">
              <Check className="size-3" />In pending review
            </span>
          )}
          {postedInfo && postedInfo.state !== 'draft' && (
            <a href={postedInfo.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 normal-case tracking-normal text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-300">
              <Check className="size-3" />Posted {timeAgo(postedInfo.at)}<ExternalLink className="size-3" />
            </a>
          )}
        </span>
        <span className="flex flex-wrap items-center justify-end gap-1.5 normal-case tracking-normal [&>button]:whitespace-nowrap">
          {edited !== null && (
            <button onClick={reset} className="touch-target inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
              <Undo2 className="size-3.5" />Reset
            </button>
          )}
          <button
            onClick={() => (editing ? setEditing(false) : startEdit())}
            className="touch-target inline-flex items-center justify-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
            {editing ? 'Done' : 'Edit'}
          </button>
          <CopyButton label="Copy" getText={() => current} />
          {post.allowPosting && post.slug && post.iid && !postedInfo && (
            <button
              onClick={() => setConfirming(true)}
              className="touch-target inline-flex items-center justify-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
            >
              <Send className="size-3.5" />Add to review
            </button>
          )}
        </span>
      </div>
      {editing ? (
        <textarea
          autoFocus
          value={edited ?? ''}
          onChange={(e) => update(e.target.value)}
          rows={Math.min(14, Math.max(4, (edited ?? '').split('\n').length + 2))}
          className="w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm leading-relaxed outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-900"
        />
      ) : edited !== null ? (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{edited}</div>
      ) : (
        <div ref={ref} className="whitespace-pre-wrap text-sm leading-relaxed">{Children.toArray(children)}</div>
      )}
      {confirming && post.slug && post.iid && (
        <ConfirmPost
          iid={post.iid}
          text={current}
          target={target}
          fallbackRef={rootRef}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            const posted = await postComment(post.slug!, commentId, current, target ?? undefined);
            setConfirming(false);
            post.reload();
            if (target && posted.inline === false) toast.warning('Could not anchor it to the diff, added as a general comment');
            toast.success(`Added to your pending review of !${post.iid}`, { description: 'Submit the review to publish it.' });
          }}
        />
      )}
    </div>
  );
}

// A handful of languages instead of highlight.js's whole "common" set: reviews quote
// TypeScript, config and shell, and rarely anything else (unknown fences stay plain).
const HIGHLIGHT = {
  detect: false,
  languages: { bash, css, diff, javascript, json, typescript, xml, yaml },
  aliases: { bash: ['sh', 'shell', 'zsh'], javascript: ['js', 'jsx', 'mjs'], typescript: ['ts', 'tsx'], xml: ['html', 'svg'], yaml: ['yml'] },
};

// Vocabulary of code reviews, merged over semfont's defaults.
const LEXICON = {
  valence: { blocker: -0.8, blocks: -0.6, regression: -0.7, leak: -0.6, unsafe: -0.7, vulnerability: -0.8, broken: -0.7, missing: -0.4, downgrade: -0.5, fixed: 0.5, resolved: 0.5 },
  salience: { critical: 0.9, important: 0.6, blocker: 0.9, merge: 0.5, must: 0.6, security: 0.7 },
  certainty: { probably: -0.5, likely: -0.4, maybe: -0.5, consider: -0.4 },
};

// Plain-text children become links (MR refs, file paths) and, optionally,
// <SemanticText>; elements (inline code, existing links, nested lists) are
// left alone.
function enrich(children: ReactNode, semantic: boolean, ctx: LinkContextValue): ReactNode {
  return Children.map(children, (c) => {
    if (typeof c !== 'string') return c;
    return linkify(c, ctx).map((part, i) =>
      typeof part === 'string' && semantic
        ? <SemanticText key={i} theme="editorial" lexicon={LEXICON}>{part}</SemanticText>
        : part,
    );
  });
}

function makeComponents(semantic: boolean, ctx: LinkContextValue): Components {
  const wrap = (children: ReactNode) => enrich(children, semantic, ctx);
  return {
    p: ({ children }) => (COMMENT_LABEL.test(textOf(children).trim()) ? null : <p>{wrap(children)}</p>),
    li: ({ children }) => <li>{wrap(children)}</li>,
    td: ({ children }) => <td>{wrap(children)}</td>,
    strong: ({ children }) => <strong>{wrap(children)}</strong>,
    em: ({ children }) => <em>{wrap(children)}</em>,
    code: ({ className, children }) => {
      const text = typeof children === 'string' ? children : '';
      const url = !className && text ? linkifyCode(text, ctx) : null;
      const code = createElement('code', { className }, children);
      return url ? <a href={url} target="_blank" rel="noreferrer" className="no-underline hover:underline">{code}</a> : code;
    },
    blockquote: ({ node, children }) => <Quote offset={node?.position?.start.offset}>{children}</Quote>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
    pre: ({ children }) => <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-100 p-3 text-[13px] dark:border-zinc-800 dark:bg-zinc-900">{children}</pre>,
    table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
  };
}

function Md({ children, semantic }: { children: string; semantic: boolean }) {
  const ctx = useContext(LinkContext);
  const components = useMemo(() => makeComponents(semantic, ctx), [semantic, ctx]);
  return (
    <SourceContext.Provider value={children}>
    <div className={cn('prose prose-zinc max-w-none [overflow-wrap:anywhere] prose-headings:tracking-tight prose-code:before:content-none prose-code:after:content-none prose-code:rounded prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal dark:prose-invert dark:prose-code:bg-zinc-800 [&_pre_code]:bg-transparent [&_pre_code]:p-0', semantic && 'semfont')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, HIGHLIGHT]]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
    </SourceContext.Provider>
  );
}

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

export function ReviewReader({ item, markdown, projectUrl, allowPosting, live, posted, reload }: { item: ReviewItem | undefined; markdown: string | null; projectUrl: string | null; allowPosting: boolean; live: BotStatus['current']; posted: Record<string, PostedInfo>; reload: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const draftCount = item ? Object.entries(posted).filter(([k, p]) => k.startsWith(`${item.slug}:`) && p.state === 'draft').length : 0;
  const postCtx = useMemo(() => ({ allowPosting, slug: item?.slug ?? null, iid: item?.tracked ? item.iid : null, posted, reload }), [allowPosting, item?.slug, item?.tracked, item?.iid, posted, reload]);
  const linkCtx = useMemo(() => ({ projectUrl, branch: item?.branch ?? null, mrWebUrl: item?.webUrl ?? null }), [projectUrl, item?.branch, item?.webUrl]);
  const { intro, sections } = useMemo(() => splitSections(markdown ?? ''), [markdown]);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const isOpen = (s: Section) => overrides[s.id] ?? OPEN_BY_DEFAULT.test(s.title);
  const [semantic, setSemantic] = usePersistentState('mr-review-viewer:semantic-on', true);
  const [panelOpen, setPanelOpen] = usePersistentState('mr-review-viewer:panel-open', true);
  const allOpen = sections.every(isOpen);
  const setAll = (open: boolean) => setOverrides(Object.fromEntries(sections.map((s) => [s.id, open])));
  const jump = (id: string) => {
    setOverrides((o) => ({ ...o, [id]: true }));
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth' }));
  };

  return (
    <LinkContext.Provider value={linkCtx}>
    <PostContext.Provider value={postCtx}>
    <div className="px-6 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-sm text-fg-muted">
            {item?.iid && <span className="font-mono">!{item.iid}</span>}
            {item?.author && <span>· {item.author}</span>}
            {item && <span>· {timeAgo(item.reviewedAt)}</span>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{item?.title ?? 'Review'}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={item?.verdict ?? null} />
            {item?.branch && <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">{item.branch}</code>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allowPosting && item?.tracked && draftCount > 0 && (
            <button onClick={() => setSubmitting(true)} className="touch-target inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
              <Send className="size-3.5" />Submit review ({draftCount})
            </button>
          )}
          <button
            onClick={() => setSemantic((v) => !v)}
            aria-pressed={semantic}
            title="Typography that follows meaning (semfont): colour for sentiment, weight for importance, slant for hedges"
            className={cn('touch-target inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm', semantic ? 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400')}
          >
            <Sparkles className="size-3.5" />Semantic type
          </button>
          {item?.webUrl && (
            <a href={item.webUrl} target="_blank" rel="noreferrer" className="touch-target inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800">
              Open in GitLab<ExternalLink className="size-3.5" />
            </a>
          )}
          <button
            onClick={() => setPanelOpen((v) => !v)}
            aria-pressed={panelOpen}
            aria-label="Toggle side panel"
            title="Toggle side panel"
            className={cn('hidden rounded-lg border p-1.5 lg:block', panelOpen ? 'border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800' : 'border-zinc-200 bg-white text-fg-muted dark:border-zinc-800 dark:bg-zinc-900')}
          >
            <PanelRight className="size-4" />
          </button>
        </div>
      </div>

      {markdown === null ? (
        <p className="text-fg-muted">Loading…</p>
      ) : (
        <div className="flex gap-8">
          <article className="mx-auto w-full min-w-0 max-w-[80ch] space-y-3">
            {intro.trim() && <Md semantic={semantic}>{intro}</Md>}
            {sections.map((s) => (
              <Collapsible.Root
                key={s.id}
                id={s.id}
                open={isOpen(s)}
                onOpenChange={(o) => setOverrides((prev) => ({ ...prev, [s.id]: o }))}
                className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
              >
                {/* A real heading around the trigger, so screen-reader users can jump between sections. */}
                <h2 className="text-base">
                  <Collapsible.Trigger className="group flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left font-medium">
                    <ChevronRight className={cn('size-4 shrink-0 text-fg-subtle transition-transform motion-reduce:transition-none', isOpen(s) && 'rotate-90')} aria-hidden />
                    {s.title}
                  </Collapsible.Trigger>
                </h2>
                <Collapsible.Content className="border-t border-zinc-100 px-4 py-4 dark:border-zinc-800">
                  <Md semantic={semantic}>{s.body}</Md>
                </Collapsible.Content>
              </Collapsible.Root>
            ))}
          </article>

          {/* Side panel: context that stays visible while reading. Collapses to give the article the room. */}
          <aside
            aria-label="Review details"
            aria-hidden={!panelOpen}
            className={cn('sticky top-[calc(var(--chrome-h)+1rem)] hidden h-[calc(100vh-var(--chrome-h)-2rem)] shrink-0 self-start overflow-hidden transition-[width,opacity] duration-300 ease-out motion-reduce:transition-none lg:block', panelOpen ? 'w-64 opacity-100' : 'w-0 opacity-0')}
          >
            <div className="flex h-full w-64 flex-col gap-5 overflow-y-auto pr-1 text-sm">
              {live && <LiveRun live={live} />}
              <section>
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">Details</h2>
                <dl className="space-y-1.5">
                  {item?.iid && <Row label="Merge request">{item.webUrl ? <a className="text-blue-600 hover:underline dark:text-blue-400" href={item.webUrl} target="_blank" rel="noreferrer">!{item.iid}</a> : `!${item.iid}`}</Row>}
                  {item?.author && <Row label="Author">{item.author}</Row>}
                  {item?.branch && <Row label="Branch"><span className="break-all font-mono text-xs">{item.branch}</span></Row>}
                  {item && <Row label="Reviewed">{timeAgo(item.reviewedAt)}</Row>}
                  {item && <Row label="Findings">{item.critical} critical · {item.important} important</Row>}
                </dl>
              </section>
              <section className="min-h-0">
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-fg-muted">
                  <h2 className="font-medium">Contents</h2>
                  <button className="normal-case hover:text-zinc-900 dark:hover:text-zinc-100" tabIndex={panelOpen ? 0 : -1} onClick={() => setAll(!allOpen)}>{allOpen ? 'Collapse all' : 'Expand all'}</button>
                </div>
                <ul className="space-y-0.5">
                  {sections.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#/${item?.slug}`}
                        tabIndex={panelOpen ? 0 : -1}
                        onClick={(e) => {
                          e.preventDefault();
                          jump(s.id);
                        }}
                        className="block truncate rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </aside>
        </div>
      )}
    </div>
    {submitting && item?.iid && (
      <ConfirmSubmit
        slug={item.slug}
        reload={reload}
        iid={item.iid}
        count={draftCount}
        onCancel={() => setSubmitting(false)}
        onConfirm={async (summary) => {
          await submitReview(item.slug, summary.trim() || undefined);
          setSubmitting(false);
          reload();
          toast.success(`Review of !${item.iid} submitted`, item.webUrl ? { action: { label: 'Open', onClick: () => window.open(item.webUrl!, '_blank', 'noopener') } } : undefined);
        }}
      />
    )}
    </PostContext.Provider>
    </LinkContext.Provider>
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
