import { cn } from '../../lib/utils';

// The one container of the studio's tool surfaces: a surface with a hairline, a header row, a body
// and an optional footer row, each separated by a hairline. Elevation is the border, never a shadow.
export function Panel({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return <section aria-label={label} className={cn('overflow-hidden rounded-xl border border-line bg-surface', className)}>{children}</section>;
}

export function PanelHeader({ icon, title, meta, aside }: { icon?: React.ReactNode; title: React.ReactNode; meta?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 shrink-0 text-fg-subtle">{icon}</span>}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          {meta && <p className="truncate text-xs text-fg-muted">{meta}</p>}
        </div>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

export function PanelFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-fg-muted">{children}</div>;
}
