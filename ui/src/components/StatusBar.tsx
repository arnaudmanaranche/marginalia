import { Command, Loader2, RefreshCw, Eye, TriangleAlert, Power, ShieldCheck, Settings } from 'lucide-react';
import type { BotStatus } from '../lib/api';
import { inTime, timeAgo } from '../lib/utils';
import { AccountMenu } from './AccountMenu';
import { Logo } from './Logo';

function BotState({ status, connection }: { status: BotStatus | null; connection: 'connecting' | 'unreachable' | 'ok' }) {
  if (connection === 'unreachable') {
    return <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300"><TriangleAlert className="size-4" />Cannot reach the studio · retrying</span>;
  }
  if (connection === 'connecting') {
    return <span className="flex items-center gap-1.5 text-fg-muted"><Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" />Connecting…</span>;
  }
  if (!status || status.phase === 'stopped') {
    return <span className="flex items-center gap-1.5 text-fg-muted"><Power className="size-4" />Bot stopped</span>;
  }
  if (status.phase === 'reviewing' && status.current) {
    // The bot's latest step, as it happens: a passing line, gone with the run.
    const step = status.current.progress?.at(-1);
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-blue-600 dark:text-blue-400">
        <Eye className="size-4 shrink-0" />Reviewing !{status.current.iid}
        <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-pulse" />
        {step && <span key={step} aria-live="polite" title={step} className="hidden min-w-0 max-w-[36ch] truncate text-xs text-fg-muted motion-safe:animate-[fade-in_200ms_ease-out] md:inline">{step}</span>}
      </span>
    );
  }
  if (status.phase === 'polling') {
    return <span className="flex items-center gap-1.5"><RefreshCw className="size-4 animate-spin motion-reduce:animate-pulse" />Polling…</span>;
  }
  if (status.phase === 'error') {
    return <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400"><TriangleAlert className="size-4" />Last poll failed</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
      <ShieldCheck className="size-4" />Idle
      {status.nextPollAt && <span className="hidden text-fg-muted sm:inline" title={status.lastPoll ? `Last poll ${timeAgo(status.lastPoll.at)}` : undefined}>· next poll {inTime(status.nextPollAt)}</span>}
    </span>
  );
}

export function StatusBar({ status, connection, settingsActive, onOpenPalette, onHome, onSettings }: { status: BotStatus | null; connection: 'connecting' | 'unreachable' | 'ok'; settingsActive: boolean; onOpenPalette: () => void; onHome: () => void; onSettings: () => void }) {
  return (
    <div className="border-b border-line">
      <div className="flex h-14 items-center gap-4 px-4">
        <button onClick={onHome} className="touch-target flex items-center gap-2 font-semibold tracking-tight"><Logo />Marginalia</button>
        <div className="ml-2 min-w-0 text-sm"><BotState status={status} connection={connection} /></div>

        <button
          onClick={onOpenPalette}
          className="touch-target ml-auto flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg-muted hover:border-zinc-300 dark:hover:border-zinc-700"
        >
          Search…
          <kbd className="flex items-center gap-0.5 rounded bg-sunken px-1.5 py-0.5 text-xs"><Command className="size-3" />K</kbd>
        </button>
        <button
          onClick={onSettings}
          aria-label="Settings"
          aria-current={settingsActive ? 'page' : undefined}
          title="Settings"
          className={`touch-target rounded-lg border p-2 hover:border-zinc-300 dark:hover:border-zinc-700 ${settingsActive ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-line bg-surface text-fg-muted'}`}
        >
          <Settings className="size-4" />
        </button>
        <AccountMenu />
      </div>
    </div>
  );
}
