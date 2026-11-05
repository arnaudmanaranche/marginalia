import { Command, Settings, Inbox } from 'lucide-react';
import { LivePill } from './ds/LivePill';
import type { BotStatus } from '../lib/api';
import { inTime, timeAgo } from '../lib/utils';
import { AccountMenu } from './AccountMenu';
import { Logo } from './Logo';

function BotState({ status, connection }: { status: BotStatus | null; connection: 'connecting' | 'unreachable' | 'ok' }) {
  if (connection === 'unreachable') return <LivePill tone="warn" label="Cannot reach the studio" detail="retrying" live />;
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
  return (
    <span title={status.lastPoll ? `Last poll ${timeAgo(status.lastPoll.at)}` : undefined}>
      <LivePill tone="ok" label="Idle" detail={status.nextPollAt ? <span className="hidden sm:inline">next poll {inTime(status.nextPollAt)}</span> : undefined} />
    </span>
  );
}

export function StatusBar({ status, connection, settingsActive, approvalsActive, approvals, onOpenPalette, onHome, onSettings, onApprovals }: { status: BotStatus | null; connection: 'connecting' | 'unreachable' | 'ok'; settingsActive: boolean; approvalsActive: boolean; approvals: number; onOpenPalette: () => void; onHome: () => void; onSettings: () => void; onApprovals: () => void }) {
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
          onClick={onApprovals}
          aria-label={approvals > 0 ? `Approvals, ${approvals} waiting` : 'Approvals'}
          aria-current={approvalsActive ? 'page' : undefined}
          title="Approvals: proposed comments waiting for your decision"
          className={`touch-target relative rounded-lg border p-2 hover:border-zinc-300 dark:hover:border-zinc-700 ${approvalsActive ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-line bg-surface text-fg-muted'}`}
        >
          <Inbox className="size-4" />
          {approvals > 0 && <span aria-hidden className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[11px] font-semibold leading-4 text-white">{approvals > 99 ? '99+' : approvals}</span>}
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
