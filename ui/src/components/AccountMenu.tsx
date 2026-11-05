import { LogOut } from 'lucide-react';
import { useMe } from '../lib/useMe';
import { signOut } from '../lib/session';

// Who is signed in, and the way out. Renders nothing in a local studio, where nobody signs in.
export function AccountMenu() {
  const me = useMe();
  if (!me) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="hidden max-w-[16ch] truncate text-fg-muted sm:inline" title={`Signed in as ${me.username}`}>{me.name}</span>
      <button
        onClick={() => void signOut()}
        aria-label={`Sign out ${me.username}`}
        title="Sign out"
        className="touch-target rounded-lg border border-line bg-surface p-2 text-fg-muted hover:border-zinc-300 dark:hover:border-zinc-700"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
