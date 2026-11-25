import { useRef } from 'react';
import { LayoutGroup, m } from 'motion/react';
import { Activity, FolderGit2, Home, Inbox, ListOrdered, PanelLeftClose, Settings, X } from 'lucide-react';
import { ACTIVITY_ROUTE, APPROVALS_ROUTE, QUEUE_ROUTE, SETTINGS_ROUTE, contextKeyOf, contextRoute } from '../lib/hashRoute';
import { transition } from '../lib/motion';
import { useModalFocus } from '../lib/useModalFocus';
import { cn } from '../lib/utils';
import { Logo } from './Logo';

export interface NavCounts { needsYou: number; inbox: number; running: number; waiting: number }
// A project in the sidebar; `attention` when its context waits for a person (a draft, or none at all).
export interface NavProject { key: string; attention: boolean }

interface Props {
  slug: string | null; counts: NavCounts; projects: NavProject[]; onGo: (route: string | null) => void;
  collapsed: boolean; onCollapse: (collapsed: boolean) => void;
}

// The fold's motion (DESIGN.md, Motion): the width eases with the studio's curve and duration; what
// appears or goes fades on the short one. Reduced motion keeps the change, without the travel.
const EASE = 'duration-[var(--dur)] ease-[var(--ease-out)] motion-reduce:transition-none';
const FADE = 'transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-out)] motion-reduce:transition-none';

// Where an entry stands: a count that waits on you is run-tinted, a count of work is quiet, and
// running work is a breathing dot. Folded to icons, a count becomes a dot at the icon's corner.
function Badge({ n, you = false, live = false, dot = false }: { n: number; you?: boolean; live?: boolean; dot?: boolean }) {
  if (live) return <span className="relative inline-flex size-1.5" aria-hidden><span className="live-ping absolute inset-0 rounded-full bg-run" /><span className="relative size-1.5 rounded-full bg-run" /></span>;
  if (n <= 0) return null;
  if (dot) return <span className={cn('size-1.5 rounded-full', you ? 'bg-run' : 'bg-fg-subtle')} aria-hidden />;
  return <span aria-hidden className={cn('min-w-5 rounded-full px-1.5 text-center font-mono text-[11px] leading-[18px] tabular-nums', you ? 'bg-run/15 text-run-ink' : 'bg-sunken text-fg-muted')}>{n > 99 ? '99+' : n}</span>;
}

// One entry. Its icon never moves when the rail folds (the same padding in both widths, the label
// clipped and faded beside it), so the eye keeps its place. The current entry's fill is one shared
// element that slides from the old entry to the new one.
function Item({ icon, label, active, collapsed, badge, said, onClick }: { icon: React.ReactNode; label: string; active: boolean; collapsed: boolean; badge?: React.ReactNode; said?: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} aria-label={said ? `${label}, ${said}` : label} data-tip={collapsed ? (said ? `${label} · ${said}` : label) : undefined}
        className={cn('touch-target group relative flex h-8 w-full items-center gap-2.5 overflow-hidden rounded-md px-3 text-left text-sm transition-colors duration-150',
          active ? 'font-medium text-fg' : 'text-fg-muted hover:bg-sunken/60 hover:text-fg')}>
        {active && <m.span layoutId="nav-current" aria-hidden className="absolute inset-0 rounded-md bg-sunken" transition={transition.base} />}
        <span className={cn('relative flex size-4 shrink-0 items-center justify-center transition-colors duration-150', active && 'text-run')}>{icon}</span>
        <span aria-hidden className={cn('relative min-w-0 flex-1 truncate whitespace-nowrap', FADE, collapsed && 'opacity-0')}>{label}</span>
        {badge && (
          <span className={cn('flex items-center transition-[top,right,opacity]', EASE, collapsed ? 'absolute top-1.5 right-2.5' : 'relative')}>{badge}</span>
        )}
      </button>
    </li>
  );
}

// The studio's screens (ADR 0012), the way a developer platform keeps them in a rail: Home, Approvals,
// Activity, Queue, then each project's context, Settings at the foot. It folds to icons with one
// motion (the width eases, labels fade, icons stay put); on a narrow screen it opens as a drawer
// (`onClose`), a true modal with its focus kept inside.
export function Sidebar({ slug, counts, projects, onGo, collapsed, onCollapse, onClose }: Props & { onClose?: () => void }) {
  const drawer = Boolean(onClose);
  const fold = collapsed && !drawer;
  const ref = useRef<HTMLElement>(null);
  useModalFocus(drawer, ref);
  const go = (route: string | null) => { onGo(route); onClose?.(); };
  const project = contextKeyOf(slug);
  return (
    // The rail and the drawer each slide their own current fill.
    <LayoutGroup id={drawer ? 'nav-drawer' : 'nav-rail'}>
    <nav ref={ref} aria-label="Studio" onKeyDown={(e) => { if (e.key === 'Escape') onClose?.(); }}
      className={cn('flex h-full flex-col overflow-hidden border-r border-line bg-canvas transition-[width]', EASE, drawer ? 'w-64' : fold ? 'w-14' : 'w-56')}>
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <button type="button" onClick={() => go(null)} aria-label="Marginalia, Home" className="touch-target flex min-w-0 items-center gap-2 rounded-md font-semibold tracking-tight">
          <Logo className="size-6 shrink-0" /><span aria-hidden className={cn('whitespace-nowrap', FADE, fold && 'opacity-0')}>Marginalia</span>
        </button>
        {drawer && <button type="button" onClick={onClose} aria-label="Close the menu" className="touch-target ml-auto rounded-md p-1.5 text-fg-muted hover:bg-sunken"><X className="size-4" /></button>}
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-3">
        <ul className="space-y-0.5">
          <Item icon={<Home className="size-4" />} label="Home" active={slug === null} collapsed={fold} onClick={() => go(null)}
            badge={<Badge n={counts.needsYou} you dot={fold} />} said={counts.needsYou > 0 ? `${counts.needsYou} need you` : undefined} />
          <Item icon={<Inbox className="size-4" />} label="Approvals" active={slug === APPROVALS_ROUTE} collapsed={fold} onClick={() => go(APPROVALS_ROUTE)}
            badge={<Badge n={counts.inbox} you dot={fold} />} said={counts.inbox > 0 ? `${counts.inbox} to decide` : undefined} />
          <Item icon={<Activity className="size-4" />} label="Activity" active={slug === ACTIVITY_ROUTE} collapsed={fold} onClick={() => go(ACTIVITY_ROUTE)}
            badge={<Badge n={0} live={counts.running > 0} />} said={counts.running > 0 ? `${counts.running} running` : undefined} />
          <Item icon={<ListOrdered className="size-4" />} label="Queue" active={slug === QUEUE_ROUTE} collapsed={fold} onClick={() => go(QUEUE_ROUTE)}
            badge={<Badge n={counts.waiting} dot={fold} />} said={counts.waiting > 0 ? `${counts.waiting} waiting` : undefined} />
        </ul>
        {projects.length > 0 && (
          <>
            {/* The heading fades out as the rail folds; a hairline fades in where it was. */}
            <div className="relative mt-4 mb-1 h-6 px-3">
              <p className={cn('absolute inset-x-3 bottom-0.5 text-xs font-medium whitespace-nowrap text-fg-muted', FADE, fold && 'opacity-0')}>Projects</p>
              <hr aria-hidden className={cn('absolute inset-x-2 top-1/2 border-line', FADE, !fold && 'opacity-0')} />
            </div>
            <ul className="space-y-0.5">
              {projects.map((p) => (
                <Item key={p.key} icon={<FolderGit2 className="size-4" />} label={p.key}
                  active={project === p.key} collapsed={fold} onClick={() => go(contextRoute(p.key))}
                  badge={p.attention ? <span className="size-1.5 rounded-full bg-warn" aria-hidden /> : undefined} said={p.attention ? 'its context needs you' : undefined} />
              ))}
            </ul>
          </>
        )}
      </div>
      <ul className="shrink-0 space-y-0.5 border-t border-line p-2">
        <Item icon={<Settings className="size-4" />} label="Settings" active={slug === SETTINGS_ROUTE} collapsed={fold} onClick={() => go(SETTINGS_ROUTE)} />
        {!drawer && (
          <Item icon={<PanelLeftClose className={cn('size-4 transition-transform', EASE, collapsed && 'rotate-180')} />} label={collapsed ? 'Expand the menu' : 'Collapse'} active={false} collapsed={fold} onClick={() => onCollapse(!collapsed)} />
        )}
      </ul>
    </nav>
    </LayoutGroup>
  );
}
