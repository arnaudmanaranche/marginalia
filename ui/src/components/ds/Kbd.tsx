// A key to press, as the studio writes it beside an action: the typed character, so it reads the same
// on QWERTY and AZERTY.
export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex min-w-4 items-center justify-center rounded border border-line-strong bg-sunken px-1 font-mono text-[11px] leading-4 text-fg-muted">{children}</kbd>;
}
