import { Children, useContext, useMemo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { SemanticText } from 'semfont';
import { LinkContext, linkify, type LinkContextValue } from '../lib/links';
import { HIGHLIGHT } from '../lib/highlight';
import { codeComponents, textOf } from '../lib/markdown';
import { cn } from '../lib/utils';
import { SourceContext } from '../lib/reviewContexts';
import { Quote } from './ReviewComment';

const LEXICON = {
  valence: { blocker: -0.8, blocks: -0.6, regression: -0.7, leak: -0.6, unsafe: -0.7, vulnerability: -0.8, broken: -0.7, missing: -0.4, downgrade: -0.5, fixed: 0.5, resolved: 0.5 },
  salience: { critical: 0.9, important: 0.6, blocker: 0.9, merge: 0.5, must: 0.6, security: 0.7 },
  certainty: { probably: -0.5, likely: -0.4, maybe: -0.5, consider: -0.4 },
};

// The "**Comment to post:**" line before a blockquote: the card already carries that label.
const COMMENT_LABEL = /^comment to post\s*:?$/i;

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

export function Md({ children, semantic }: { children: string; semantic: boolean }) {
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

const GLANCE_LINE = /^[-*]\s+\*\*(What|Why|Risk|Blocking):\*\*\s*(.+)$/i;
const NOTHING_BLOCKING = /^(nothing|none|rien|aucun)\b/i;

// "At a Glance": four one-line answers (What / Why / Risk / Blocking) as a definition list.
// Falls back to plain markdown if the agent wrote something else.
export function GlanceBody({ body, semantic }: { body: string; semantic: boolean }) {
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
