import { Command, Menu } from 'lucide-react';
import { LivePill } from './ds/LivePill';
import type { BotStatus } from '../lib/api';
import { inTime, timeAgo } from '../lib/utils';
import { AccountMenu } from './AccountMenu';
import { Logo } from './Logo';

// `shownSince`: when the data on screen was read; once the API is lost, it says how old that is.
function BotLine({ status, connection, shownSince }: { status: BotStatus | null; connection: 'connecting' | 'unreachable' | 'ok'; shownSince: number | null }) {
  if (connection === 'unreachable') {
    return <LivePill tone="warn" label="Cannot reach the studio" detail={shownSince ? <><span className="hidden sm:inline">showing what it said {timeAgo(new Date(shownSince).toISOString())}, </span>retrying</> : 'retrying'} title="What is on screen may be out of date until the studio answers again." live />;
  }
  if (connection === 'connecting') return <LivePill tone="idle" label="Connecting" live />;
  if (!status || status.phase === 'stopped') return <LivePill tone="idle" label="Bot stopped" />;
  if (status.phase === 'reviewing' && status.current) {
    // The bot's latest step, as it happens: a passing line, gone with the run.
    const step = status.current.progress?.at(-1);
    const what = status.current.iid != null ? `!${status.current.iid}` : status.current.title;
    // Projects run side by side: the latest run is named, the others counted.
    const others = (status.running?.length ?? 1) - 1;
    return (
      <span className="flex min-w-0 items-center gap-2">
        <LivePill tone="run" label={`Reviewing ${what}`} detail={others > 0 ? `+${others}` : undefined} title={status.running?.map((r) => `${r.project ?? ''} !${r.iid} ${r.title}`).join('\n')} live className="shrink-0" />
        {step && <span key={step} aria-live="polite" title={step} className="hidden min-w-0 max-w-[40ch] truncate text-xs text-fg-muted motion-safe:animate-[fade-in_200ms_ease-out] md:inline">{step}</span>}
      </span>
    );
  }
  if (status.phase === 'polling') return <LivePill tone="run" label="Polling" live />;
  if (status.phase === 'error') return <LivePill tone="fail" label="Last poll failed" />;
  // A poll past the budget reviews nothing: say that first, not when the next poll comes.
  if (status.budget?.over) {
    return <LivePill tone="warn" label="Budget reached" detail={<span className="hidden sm:inline">automatic reviews wait until midnight</span>} title="A mention, or Run again (↻) on a review, still runs." />;
  }
  return (
    <span title={status.lastPoll ? `Last poll ${timeAgo(status.lastPoll.at)}` : undefined}>
      <LivePill tone="ok" label="Idle" detail={status.nextPollAt ? <span className="hidden sm:inline">next poll {inTime(status.nextPollAt)}</span> : undefined} />
    </span>
  );
}

// The bar over every screen: the bot's state, search and the account. The screens themselves are in
// the sidebar (ADR 0012); on a narrow screen, where the sidebar is a drawer, the bar opens it.
export function StatusBar({ status, connection, shownSince = null, streaming = true, onOpenPalette, onHome, onMenu }: { status: BotStatus | null; connection: 'connecting' | 'unreachable' | 'ok'; shownSince?: number | null; streaming?: boolean; onOpenPalette: () => void; onHome: () => void; onMenu: () => void }) {
  return (
    <div className="border-b border-line">
      <div className="flex h-14 items-center gap-3 px-4">
        <button type="button" onClick={onMenu} aria-label="Open the menu" className="touch-target -ml-1.5 rounded-md p-1.5 text-fg-muted hover:bg-sunken md:hidden"><Menu className="size-5" /></button>
        <button type="button" onClick={onHome} aria-label="Marginalia, Home" className="touch-target md:hidden"><Logo /></button>
        <div className="min-w-0 text-sm"><BotLine status={status} connection={connection} shownSince={shownSince} />
          {/* The API answers but the live stream is down: changes show within 30s instead of at once. */}
          {connection === 'ok' && !streaming && <span title="The live connection dropped and is reconnecting. Until then the page checks every 30 seconds." className="ml-2 hidden text-xs text-fg-muted sm:inline">· live updates paused, checking every 30s</span>}</div>

        <button
          onClick={onOpenPalette}
          aria-label="Search"
          className="touch-target ml-auto flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg-muted hover:border-line-strong"
        >
          <span className="hidden sm:inline">Search…</span>
          <kbd className="flex items-center gap-0.5 rounded bg-sunken px-1.5 py-0.5 text-xs"><Command className="size-3" />K</kbd>
        </button>
        <AccountMenu />
      </div>
    </div>
  );
}
