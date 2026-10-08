import { Children, Fragment, useContext, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { SemanticText } from 'semfont';
import { toast } from 'sonner';
import { useScrollLock } from '../lib/useScrollLock';
import { usePersistentState } from '../lib/layout';
import { useModalFocus } from '../lib/useModalFocus';
import { createContext } from 'react';
import { Check, Copy, Trash2, X, Loader2, Pencil, Send, Undo2 } from 'lucide-react';
import { deleteDraft, fetchDrafts, postComment, updateDraft, submitReview, type ReviewAction, type DraftNote, BotStatus, type PostedInfo, type ReviewContent, type ReviewItem, type Finding } from '../lib/api';
import { Discussion } from './Discussion';
import { CollapsibleCard } from './CollapsibleCard';
import { PostedBadge } from './PostedBadge';
import { ReaderHeader } from './ReaderHeader';
import { ReaderSidePanel } from './ReaderSidePanel';
import { useRerun } from '../lib/useRerun';
import { useReviewVersions } from '../lib/useReviewVersions';
import { ConfirmPost } from './ConfirmPost';
import { FindingsPanel } from './FindingsPanel';
import { FixesPanel } from './FixesPanel';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';
import { LinkContext, commentLocation, linkify, type LinkContextValue } from '../lib/links';
import { HIGHLIGHT } from '../lib/highlight';
import { codeComponents, textOf } from '../lib/markdown';
import { NoteMarkdown } from './NoteMarkdown';

interface Section {
  id: string;
  title: string;
  body: string;
}

const OPEN_BY_DEFAULT = /critical|important|verdict|summary|blocking|bloquant|statut|status|at a glance|shape of the change/i;

// Reading order: what the MR does first, then what to act on, then the supporting
// sections. Reviews written before "At a Glance" existed just skip those ranks.
const SECTION_RANKS: [RegExp, number][] = [
  [/summary/i, 0],
  [/at a glance/i, 1],
  [/shape of the change/i, 2],
  [/critical/i, 3],
  [/important/i, 4],
  [/suggestion/i, 5],
  [/out of scope/i, 6],
];
const SUPPORTING_RANK = 7;
const rankOf = (title: string) => SECTION_RANKS.find(([re]) => re.test(title))?.[1] ?? SUPPORTING_RANK;
const GLANCE_LINE = /^[-*]\s+\*\*(What|Why|Risk|Blocking):\*\*\s*(.+)$/i;
const NOTHING_BLOCKING = /^(nothing|none|rien|aucun)\b/i;

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

// The "**Branch:** x | **Ticket:** y | **MR:** !n" line of the summary: pulled out of
// the text, since the side panel shows it (with links).
const META_LINE = /^[ \t]*\*\*Branch:\*\*[ \t]*(.*?)[ \t]*\|[ \t]*\*\*Ticket:\*\*[ \t]*(.*?)[ \t]*\|[ \t]*\*\*MR:\*\*[ \t]*(.*?)[ \t]*$\n?/m;
const TICKET_KEY = /\b[A-Z][A-Z0-9]+-\d+\b/;
// The Ticket field is free text ("ESD-1446 (Jira not reachable…)"): only the key is kept,
// the rest goes to a tooltip.
function extractMeta(md: string): { markdown: string; ticket: { key: string; note: string | null } | null } {
  const m = md.match(META_LINE);
  if (!m) return { markdown: md, ticket: null };
  const raw = m[2].replace(/[*`[\]]/g, '').trim();
  const key = raw.match(TICKET_KEY)?.[0];
  return { markdown: md.replace(META_LINE, ''), ticket: key ? { key, note: raw === key ? null : raw } : null };
}

function CopyButton({ getText, label, disabled }: { getText: () => string; label: string; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      disabled={disabled}
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
    >
      {done ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      {done ? 'Copied' : label}
    </Button>
  );
}

// Comparable form of a comment: the rendered text drops the markdown the source has.
const squash = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

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
  // A re-run is queued or running: the comments on screen are about to be replaced.
  locked: boolean;
  // What the bot read out of this review, to give a comment the id of its finding.
  findings: Finding[];
}
const PostContext = createContext<PostContextValue>({ allowPosting: false, slug: null, iid: null, posted: {}, reload: () => {}, locked: false, findings: [] });
// The markdown a blockquote's `position.start.offset` refers to (one section body, not the whole review).
const SourceContext = createContext('');

// The "**Comment to post:**" line before a blockquote: the card already carries that label.
const COMMENT_LABEL = /^comment to post\s*:?$/i;

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
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-2">
        <code className="min-w-0 break-all text-xs text-fg-muted">{draft.path ? `${draft.path}${draft.line ? `:${draft.line}` : ''}` : 'General comment'}</code>
        <span className="flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" disabled={busy || disabled || !text.trim()} onClick={() => run(async () => { await updateDraft(slug, draft.id, text.trim()); onChanged({ ...draft, body: text.trim() }); setEditing(false); }, 'Could not update the draft')}>
                <Check className="size-3.5" />Save
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setText(draft.body); setEditing(false); }}>
                <X className="size-3.5" />Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" disabled={busy || disabled} onClick={() => setEditing(true)} aria-label="Edit this draft"><Pencil className="size-3.5" />Edit</Button>
              <Button size="sm" variant="danger" disabled={busy || disabled} onClick={() => run(async () => { await deleteDraft(slug, draft.id); onChanged(null); }, 'Could not delete the draft')} aria-label="Delete this draft">
                <Trash2 className="size-3.5" />Delete
              </Button>
            </>
          )}
        </span>
      </div>
      {editing ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(10, Math.max(3, text.split('\n').length + 1))} aria-label="Draft text" className="mt-2 w-full resize-y rounded-md border border-zinc-300 bg-white p-2 text-sm outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-900" />
      ) : (
        <NoteMarkdown className="mt-1">{draft.body}</NoteMarkdown>
      )}
    </div>
  );
}

const ACTIONS: { value: ReviewAction; label: string; submit: string; hint: string }[] = [
  { value: 'comment', label: 'Comment', submit: 'Submit comments', hint: 'Publish your comments without a verdict.' },
  { value: 'approve', label: 'Approve', submit: 'Approve', hint: 'Publish, then approve the MR as you. Refused if the MR changed since this review.' },
  { value: 'request_changes', label: 'Request changes', submit: 'Request changes', hint: 'Publish and mark the MR as needing changes.' },
];

// Publishes the pending review: every draft comment of this MR, plus an optional summary,
// with the verdict the user picks (a triage of your own MR can only comment).
function ConfirmSubmit({ slug, iid, count, canVerdict, reload, onCancel, onConfirm }: { slug: string; reload: () => void; iid: string | number; count: number; canVerdict: boolean; onCancel: () => void; onConfirm: (summary: string, action: ReviewAction) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState('');
  const [action, setAction] = useState<ReviewAction>('comment');
  const chosen = ACTIONS.find((a) => a.value === action)!;
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
  const onKey = useEffectEvent((e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel());
  useEffect(() => {
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={busy ? undefined : onCancel}>
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
        {canVerdict && (
          <fieldset className="mt-3" disabled={busy}>
            <legend className="text-sm font-medium">Your review</legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              {ACTIONS.map((a) => (
                <label key={a.value} className="flex cursor-pointer flex-col rounded-md border border-zinc-300 p-2 text-sm has-[:checked]:border-blue-500 has-[:checked]:ring-2 has-[:checked]:ring-blue-500/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500/50 dark:border-zinc-700">
                  <span className="flex items-center gap-2 font-medium">
                    <input type="radio" name="review-action" value={a.value} checked={action === a.value} onChange={() => setAction(a.value)} className="accent-blue-600" />
                    {a.label}
                  </span>
                  <span className="mt-1 text-xs text-fg-muted">{a.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label htmlFor="review-summary" className="mt-3 block text-sm font-medium">Summary <span className="font-normal text-fg-muted">(optional)</span></label>
        <textarea id="review-summary" data-autofocus value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} className="mt-1 w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-900" />
        <div className="mt-4 flex justify-end gap-2">
          <Button disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(summary, canVerdict ? action : 'comment');
              } catch (e) {
                toast.error('Could not submit the review', { description: (e as Error).message });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" /> : <Send className="size-4" />}{canVerdict ? chosen.submit : 'Submit review'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// The comment as the skill wrote it: the lines of the blockquote that starts at `offset`.
function writtenComment(source: string, offset: number | undefined): string | null {
  if (offset === undefined) return null;
  const out: string[] = [];
  for (const line of source.slice(offset).split('\n')) {
    if (!/^\s*>/.test(line)) break;
    out.push(line.replace(/^\s*>\s?/, ''));
  }
  return out.join('\n').trim() || null;
}

// The file:line the review mentions just above the comment, since the last heading.
function commentTargetAt(source: string, offset: number | undefined) {
  if (offset === undefined) return null;
  const above = source.slice(0, offset);
  return commentLocation(above.slice(Math.max(above.lastIndexOf('\n#'), 0)));
}

// The id of the finding a comment belongs to, which survives a re-run that rewords it, and where
// it stands on GitLab. Comments posted before findings existed were keyed by a hash of their text.
function resolveComment(post: PostContextValue, original: string, legacyId: string) {
  const commentId = post.findings.find((f) => f.comment && squash(f.comment) === squash(original))?.id ?? legacyId;
  const postedInfo = post.slug ? post.posted[`${post.slug}:${commentId}`] ?? post.posted[`${post.slug}:${legacyId}`] : undefined;
  return { commentId, postedInfo };
}

// The "**Comment to post:**" blockquotes are meant to be pasted into GitLab:
// copy as is, or edit first in a textarea (the edit is kept locally).
function Quote({ children, offset }: { children?: ReactNode; offset?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [original, setOriginal] = useState(() => textOf(children).trim());
  const key = editKey(original);
  const [edited, setEdited] = useState<string | null>(() => readEdit(key));
  const [editing, setEditing] = useState(false);
  const post = useContext(PostContext);
  const source = useContext(SourceContext);
  // The comment as the skill wrote it (fences and backticks intact, which GitLab renders), not
  // the rendered text: the code cards add their own labels to what the page shows.
  const written = useMemo(() => writtenComment(source, offset), [source, offset]);
  const current = edited ?? written ?? ref.current?.innerText.trim() ?? original;
  // The id of the finding this comment belongs to, which survives a re-run that rewords it.
  // Comments posted before findings existed were keyed by a hash of their text.
  const { commentId, postedInfo } = resolveComment(post, original, key.split(':').pop() ?? '');
  const [confirming, setConfirming] = useState(false);
  // The file:line the review mentions just above this comment, since the last heading.
  const target = useMemo(() => commentTargetAt(source, offset), [source, offset]);
  // Focus lands here if the button that opened the dialog is gone (a posted comment replaces it).
  const rootRef = useRef<HTMLDivElement>(null);
  // A re-run is about to replace this comment: close the editor and any open confirmation.
  // An edit already typed stays saved locally under its key.
  useEffect(() => {
    if (!post.locked) return;
    setEditing(false);
    setConfirming(false);
  }, [post.locked]);

  const startEdit = () => {
    const text = written ?? ref.current?.innerText.trim() ?? original;
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
          <PostedBadge info={postedInfo} className="ml-2 normal-case tracking-normal" />
        </span>
        <span className="flex flex-wrap items-center justify-end gap-1.5 normal-case tracking-normal [&>button]:whitespace-nowrap">
          {edited !== null && (
            <Button size="sm" variant="ghost" disabled={post.locked} onClick={reset}>
              <Undo2 className="size-3.5" />Reset
            </Button>
          )}
          <Button size="sm" disabled={post.locked} onClick={() => (editing ? setEditing(false) : startEdit())}>
            {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
            {editing ? 'Done' : 'Edit'}
          </Button>
          <CopyButton label="Copy" disabled={post.locked} getText={() => current} />
          {post.allowPosting && post.slug && post.iid && !postedInfo && (
            <Button size="sm" variant="primary" disabled={post.locked} title={post.locked ? 'A review re-run is in progress: this comment is about to be replaced' : undefined} onClick={() => setConfirming(true)}>
              <Send className="size-3.5" />Add to review
            </Button>
          )}
        </span>
      </div>
      {editing ? (
        <textarea
          autoFocus
          aria-label="Edit the comment"
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
    ...codeComponents(ctx),
    blockquote: ({ node, children }) => <Quote offset={node?.position?.start.offset}>{children}</Quote>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
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

// "At a Glance": four one-line answers (What / Why / Risk / Blocking) as a definition list.
// Falls back to plain markdown if the agent wrote something else.
function GlanceBody({ body, semantic }: { body: string; semantic: boolean }) {
  const rows = body.split('\n').flatMap((line) => {
    const m = line.trim().match(GLANCE_LINE);
    return m ? [{ label: m[1], text: m[2] }] : [];
  });
  if (rows.length === 0) return <Md semantic={semantic}>{body}</Md>;
  return (
    <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-2.5">
      {rows.map((r) => {
        const blocking = /^blocking$/i.test(r.label) && !NOTHING_BLOCKING.test(r.text);
        return (
          <div key={r.label} className="contents">
            <dt className={cn('pt-0.5 text-xs font-medium uppercase tracking-wide text-fg-subtle', blocking && 'text-red-600 dark:text-red-400')}>{r.label}</dt>
            <dd className="min-w-0 [&_.prose_p]:m-0"><Md semantic={semantic}>{r.text}</Md></dd>
          </div>
        );
      })}
    </dl>
  );
}

// Which sections are open: what the person toggled, else a default by title.
function useSectionState(sections: Section[]) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  // Once "At a Glance" carries the gist, the summary's Overview is a repeat: fold it.
  const hasGlance = sections.some((s) => /at a glance/i.test(s.title));
  const isOpen = (s: Section) => overrides[s.id] ?? (hasGlance && /summary/i.test(s.title) ? false : OPEN_BY_DEFAULT.test(s.title));
  const allOpen = sections.every(isOpen);
  const setAll = (open: boolean) => setOverrides(Object.fromEntries(sections.map((s) => [s.id, open])));
  const jump = (id: string) => {
    setOverrides((o) => ({ ...o, [id]: true }));
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth' }));
  };
  return { overrides, setOverrides, isOpen, allOpen, setAll, jump };
}

// Why a report reads the way it does: an old version on screen, or findings the studio could not read.
function ReaderNotices({ viewingOld, onBackToLatest, shape }: { viewingOld: boolean; onBackToLatest: () => void; shape: ReviewContent["shape"] | null }) {
  return (
    <>
      {viewingOld && (
        <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          You are reading an earlier version of this review. Comments can't be posted from it.{' '}
          <button className="underline" onClick={onBackToLatest}>Back to the latest</button>
        </p>
      )}
      {shape && shape.warnings.length > 0 && (
        <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">{shape.source === 'none' ? 'This report has no findings the studio could read' : 'About how this report was read'}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{shape.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
    </>
  );
}

export function ReviewReader({ item, review: currentReview, projectUrl, jiraBaseUrl, allowPosting, allowPush, live, posted, reload }: { item: ReviewItem | undefined; review: ReviewContent | null; projectUrl: string | null; jiraBaseUrl: string | null; allowPosting: boolean; allowPush: boolean; live: BotStatus['current']; posted: Record<string, PostedInfo>; reload: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const { versions, versionId, setVersionId, oldReview } = useReviewVersions(item?.slug, item?.reviewedAt);
  const viewingOld = versionId !== null;
  const content = viewingOld ? oldReview : currentReview;
  const markdown = content?.markdown ?? null;
  const shape = content?.shape ?? null;
  const { rerunning, rerun } = useRerun(item, live);
  const draftCount = item ? Object.entries(posted).filter(([k, p]) => k.startsWith(`${item.slug}:`) && p.state === 'draft').length : 0;
  const locked = rerunning || Boolean(live) || viewingOld;
  const postCtx = useMemo(() => ({ allowPosting, slug: item?.slug ?? null, iid: item?.tracked ? item.iid : null, posted, reload, locked, findings: shape?.findings ?? [] }), [allowPosting, item?.slug, item?.tracked, item?.iid, posted, reload, locked, shape]);
  const linkCtx = useMemo(() => ({ projectUrl, branch: item?.branch ?? null, mrWebUrl: item?.webUrl ?? null }), [projectUrl, item?.branch, item?.webUrl]);
  const meta = useMemo(() => extractMeta(markdown ?? ''), [markdown]);
  // Findings the person can't reach from the report's own text (no comment card for them there).
  const loose = useMemo(() => {
    const text = squash(markdown ?? '');
    return (shape?.findings ?? []).filter((f) => !f.comment || !text.includes(squash(f.comment)));
  }, [markdown, shape]);
  const { intro, sections } = useMemo(() => splitSections(meta.markdown), [meta]);
  const ordered = useMemo(
    () => sections.map((s, i) => ({ s, i })).sort((a, b) => rankOf(a.s.title) - rankOf(b.s.title) || a.i - b.i).map((x) => x.s),
    [sections],
  );
  const firstSupporting = ordered.find((s) => rankOf(s.title) === SUPPORTING_RANK && ordered.some((o) => rankOf(o.title) < SUPPORTING_RANK))?.id;
  const { overrides, setOverrides, isOpen, allOpen, setAll, jump } = useSectionState(sections);
  const [semantic, setSemantic] = usePersistentState('mr-review-viewer:semantic-on', true);
  const [panelOpen, setPanelOpen] = usePersistentState('mr-review-viewer:panel-open', true);

  return (
    <LinkContext.Provider value={linkCtx}>
    <PostContext.Provider value={postCtx}>
    <div className="px-6 py-6">
      <ReaderHeader
        item={item}
        showSubmit={allowPosting && Boolean(item?.tracked) && (draftCount > 0 || item?.kind === 'review')}
        draftCount={draftCount}
        onSubmit={() => setSubmitting(true)}
        versions={versions}
        versionId={versionId}
        onVersion={setVersionId}
        locked={locked}
        onRerun={rerun}
        semantic={semantic}
        onSemantic={() => setSemantic((v) => !v)}
        panelOpen={panelOpen}
        onPanel={() => setPanelOpen((v) => !v)}
      />

      {markdown === null ? (
        <p className="text-fg-muted">Loading…</p>
      ) : (
        <div className="flex gap-8">
          <article className="mx-auto w-full min-w-0 max-w-[80ch] space-y-3">
            <ReaderNotices viewingOld={viewingOld} onBackToLatest={() => setVersionId(null)} shape={shape} />
            {intro.trim() && <Md semantic={semantic}>{intro}</Md>}
            {ordered.map((s) => (
              <Fragment key={s.id}>
              {s.id === firstSupporting && <p className="px-1 pt-3 text-xs font-medium uppercase tracking-wide text-fg-subtle">Supporting detail</p>}
              <CollapsibleCard id={s.id} title={s.title} open={isOpen(s)} onOpenChange={(o) => setOverrides((prev) => ({ ...prev, [s.id]: o }))}>
                {/at a glance/i.test(s.title) ? <GlanceBody body={s.body} semantic={semantic} /> : <Md semantic={semantic}>{s.body}</Md>}
              </CollapsibleCard>
              </Fragment>
            ))}
            {item?.tracked && item.iid && !viewingOld && loose.length > 0 && (
              <CollapsibleCard id="findings" title={`Findings to comment on (${loose.length})`} open={overrides.findings ?? true} onOpenChange={(o) => setOverrides((prev) => ({ ...prev, findings: o }))}>
                <FindingsPanel findings={loose} slug={item.slug} iid={item.iid} allowPosting={allowPosting} locked={locked} posted={posted} reload={reload} />
              </CollapsibleCard>
            )}
            {item?.tracked && item.iid && item.kind === 'comments' && !viewingOld && (
              <CollapsibleCard id="fixes" title="Fixes to push" open={overrides.fixes ?? true} onOpenChange={(o) => setOverrides((prev) => ({ ...prev, fixes: o }))}>
                <FixesPanel slug={item.slug} iid={item.iid} allowPush={allowPush} locked={locked} refreshKey={item.reviewedAt} />
              </CollapsibleCard>
            )}
            {item?.tracked && item.kind === 'review' && !viewingOld && (
              <CollapsibleCard id="discussion" title="Discussion on GitLab" open={overrides.discussion ?? true} onOpenChange={(o) => setOverrides((prev) => ({ ...prev, discussion: o }))}>
                <Discussion slug={item.slug} canReply={allowPosting && !locked} refreshKey={`${item.reviewedAt}:${draftCount}`} reload={reload} />
              </CollapsibleCard>
            )}
          </article>

          <ReaderSidePanel item={item} live={live} open={panelOpen} projectUrl={projectUrl} jiraBaseUrl={jiraBaseUrl} ticket={meta.ticket} sections={ordered} allOpen={allOpen} onToggleAll={() => setAll(!allOpen)} onJump={jump} />
        </div>
      )}
    </div>
    {submitting && item?.iid && (
      <ConfirmSubmit
        slug={item.slug}
        reload={reload}
        iid={item.iid}
        count={draftCount}
        canVerdict={item.kind === 'review'}
        onCancel={() => setSubmitting(false)}
        onConfirm={async (summary, action) => {
          await submitReview(item.slug, summary.trim() || undefined, action);
          setSubmitting(false);
          reload();
          const done = { comment: 'submitted', approve: 'approved', request_changes: 'submitted with changes requested' }[action];
          toast.success(`Review of !${item.iid} ${done}`, item.webUrl ? { action: { label: 'Open', onClick: () => window.open(item.webUrl!, '_blank', 'noopener') } } : undefined);
        }}
      />
    )}
    </PostContext.Provider>
    </LinkContext.Provider>
  );
}
