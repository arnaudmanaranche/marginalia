// The tool an agent called, as a compact mono chip: `read`, `git`, `jira.search`. Mono because a
// tool name is an identifier; muted so the step's words lead.
export function ToolChip({ name }: { name: string }) {
  return <code className="inline-flex shrink-0 items-center rounded-md bg-sunken px-1.5 py-px font-mono text-[11px] leading-4 text-fg-muted ring-1 ring-inset ring-line-strong">{name}</code>;
}

// Several tools, the first few named and the rest counted.
export function ToolChips({ names, max = 3 }: { names: string[]; max?: number }) {
  if (!names.length) return null;
  const rest = names.length - max;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {names.slice(0, max).map((n) => <ToolChip key={n} name={n} />)}
      {rest > 0 && <span className="text-[11px] text-fg-muted">+{rest}</span>}
    </span>
  );
}
