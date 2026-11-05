import type { ContextCriticalPath, ContextItem, ContextSource, ContextTerm, ProjectContext } from '../lib/contextApi';

// A project's context, read top to bottom: what it is, what breaks the most, its words, how it is
// built and what it does. Every item says where it was learned, so a person can check it.

function Sources({ sources }: { sources: ContextSource[] }) {
  return (
    <p className="mt-1 text-xs text-fg-muted [overflow-wrap:anywhere]">
      From{' '}
      {sources.map((s, i) => (
        <span key={`${s.kind}:${s.ref}`}>
          {i > 0 && ' · '}
          {/^https?:\/\//.test(s.ref)
            ? <a href={s.ref} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-fg">{s.kind}</a>
            : <span><span className="sr-only">{s.kind}: </span><code className="font-mono">{s.ref}</code></span>}
        </span>
      ))}
    </p>
  );
}

// Paths and test files are code; known weak spots are words (`plain`).
const Where = ({ label, items, plain = false }: { label: string; items?: string[]; plain?: boolean }) => (items?.length
  ? <p className="mt-1 text-xs text-fg-muted [overflow-wrap:anywhere]">{label}: {plain ? items.join('; ') : items.map((w, i) => <span key={w}>{i > 0 && ', '}<code className="font-mono">{w}</code></span>)}</p>
  : null);

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-base font-medium">{title}</h2>
      <div className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">{children}</div>
    </section>
  );
}

function Path({ path }: { path: ContextCriticalPath }) {
  return (
    <li className="flex gap-3 p-4">
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

export function ContextSections({ context }: { context: ProjectContext }) {
  return (
    <>
      <p className="mt-6 max-w-[80ch] text-base leading-7">{context.summary}</p>
      <Section id="ctx-paths" title={`Critical paths (${context.criticalPaths.length})`}>
        <ol>{[...context.criticalPaths].sort((a, b) => a.rank - b.rank).map((p) => <Path key={p.name} path={p} />)}</ol>
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
    </>
  );
}
