import { useContext, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { LinkContext, repoUrl } from '../lib/links';
import { ticketPage } from '../lib/tickets';
import type { ContextCriticalPath, ContextItem, ContextSource, ContextTerm, ProjectContext } from '../lib/contextApi';

// A project's context, read top to bottom: what it is, what breaks the most, its words, how it is
// built and what it does. Every item says where it was learned, so a person can check it.

function Sources({ sources }: { sources: ContextSource[] }) {
  const ctx = useContext(LinkContext);
  // A ticket opens on the tracker when one is set, a file in the repository at the commit learned; a URL is a link already.
  const href = (s: ContextSource) => (/^https?:\/\//.test(s.ref) ? s.ref : s.kind === 'ticket' ? ticketPage(ctx.tickets ?? null, s.ref) : s.kind === 'file' ? repoUrl(ctx, s.ref) : null);
  return (
    <p className="mt-1 text-xs text-fg-muted [overflow-wrap:anywhere]">
      From{' '}
      {sources.map((s, i) => (
        <span key={`${s.kind}:${s.ref}`}>
          {i > 0 && ' · '}
          {href(s)
            ? <a href={href(s)!} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-fg">{s.kind === 'ticket' || s.kind === 'file' ? <code className="font-mono">{s.ref}</code> : s.kind}</a>
            : <span><span className="sr-only">{s.kind}: </span><code className="font-mono">{s.ref}</code></span>}
        </span>
      ))}
    </p>
  );
}

// Paths and test files are code, opening in the repository at the commit learned; known weak spots are words (`plain`).
function Where({ label, items, plain = false }: { label: string; items?: string[]; plain?: boolean }) {
  const ctx = useContext(LinkContext);
  if (!items?.length) return null;
  const code = (w: string) => {
    const url = repoUrl(ctx, w);
    const text = <code className="font-mono">{w}</code>;
    return url ? <a href={url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-fg">{text}</a> : text;
  };
  return <p className="mt-1 text-xs text-fg-muted [overflow-wrap:anywhere]">{label}: {plain ? items.join('; ') : items.map((w, i) => <span key={w}>{i > 0 && ', '}{code(w)}</span>)}</p>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-base font-medium">{title}</h2>
      <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">{children}</div>
    </section>
  );
}

// The path a link pointed at comes into view and glows for a moment, as a changed row does on Home.
function Path({ path, focused }: { path: ContextCriticalPath; focused: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const [glow, setGlow] = useState(false);
  useEffect(() => {
    if (!focused) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    setGlow(true);
    const t = setTimeout(() => setGlow(false), 1500);
    return () => clearTimeout(t);
  }, [focused]);
  return (
    <li ref={ref} aria-current={focused ? 'location' : undefined} className={cn('flex gap-3 p-4 transition-colors motion-reduce:transition-none', glow ? 'bg-run/20 duration-150' : 'duration-1000')}>
      <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-fg-muted" aria-label={`Rank ${path.rank}`}>{path.rank}</span>
      <div className="min-w-0">
        <p className="text-sm"><span className="font-medium">{path.name}</span>: {path.summary}</p>
        <Where label="Lives in" items={path.where} />
        <Where label="Fragile" items={path.fragile} plain />
        <Where label="Tested by" items={path.tests} />
        <Sources sources={path.sources} />
      </div>
    </li>
  );
}

function Term({ term }: { term: ContextTerm }) {
  return (
    <li className="p-4">
      <p className="text-sm">
        <span className="font-medium">{term.name}</span>
        {term.codeNames?.length ? <span className="text-fg-muted"> ({term.codeNames.map((n, i) => <span key={n}>{i > 0 && ', '}<code className="font-mono">{n}</code></span>)})</span> : null}
        : {term.summary}
        {term.avoid?.length ? <span className="text-fg-muted"> Not: {term.avoid.join(', ')}.</span> : null}
      </p>
      <Sources sources={term.sources} />
    </li>
  );
}

function Item({ item }: { item: ContextItem }) {
  return (
    <li className="p-4">
      <p className="text-sm"><span className="font-medium">{item.name}</span>: {item.summary}</p>
      <Where label="Where" items={item.where} />
      <Sources sources={item.sources} />
    </li>
  );
}

const PURPOSE = { setup: 'Set up', run: 'Run', test: 'Test' } as const;

// The commands a verification may run: shown plainly, since approving the context approves them.
function Recipe({ recipe }: { recipe: NonNullable<ProjectContext['verification']> }) {
  return (
    <Section id="ctx-verification" title="How to run it (verification)">
      <ul>
        {recipe.steps.map((s) => (
          <li key={`${s.purpose}:${s.run}`} className="p-4">
            <p className="text-sm"><span className="font-medium">{PURPOSE[s.purpose]}</span>: {s.summary}</p>
            <p className="mt-1"><code className="font-mono text-xs [overflow-wrap:anywhere]">{s.run}</code></p>
            <Sources sources={s.sources} />
          </li>
        ))}
        <li className="p-4 text-sm text-fg-muted">
          {recipe.hosts?.length ? <>May reach only: {recipe.hosts.map((h, i) => <span key={h}>{i > 0 && ', '}<code className="font-mono">{h}</code></span>)}.</> : 'No network.'}
          {recipe.notes ? <> {recipe.notes}</> : null}
        </li>
      </ul>
    </Section>
  );
}

export function ContextSections({ context, focusPath = null }: { context: ProjectContext; focusPath?: string | null }) {
  return (
    <>
      <p className="mt-6 max-w-[80ch] text-base leading-7">{context.summary}</p>
      <Section id="ctx-paths" title={`Critical paths (${context.criticalPaths.length})`}>
        <ol>{[...context.criticalPaths].sort((a, b) => a.rank - b.rank).map((p) => <Path key={p.name} path={p} focused={p.name === focusPath} />)}</ol>
      </Section>
      <Section id="ctx-glossary" title={`Glossary (${context.glossary.length})`}>
        <ul>{context.glossary.map((t) => <Term key={t.name} term={t} />)}</ul>
      </Section>
      <Section id="ctx-features" title={`Features (${context.features.length})`}>
        <ul>{context.features.map((f) => <Item key={f.name} item={f} />)}</ul>
      </Section>
      <Section id="ctx-stack" title={`Stack (${context.stack.length})`}>
        <ul>{context.stack.map((s) => <Item key={s.name} item={s} />)}</ul>
      </Section>
      {context.verification && <Recipe recipe={context.verification} />}
    </>
  );
}
