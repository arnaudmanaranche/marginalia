import { sendJson } from './fetchRetry';

// Who is signed in to a hosted studio. Locally nobody is: `/api/me` answers `{}` and the studio
// shows no account.
export interface Me { username: string; name: string }

export function meOf(body: unknown): Me | null {
  const b = body as { username?: unknown; name?: unknown } | null;
  return b && typeof b.username === 'string' ? { username: b.username, name: typeof b.name === 'string' && b.name ? b.name : b.username } : null;
}

// Ends the session, then goes to the login: the next visit starts from GitLab again.
export async function signOut(win: Pick<Window, 'fetch' | 'location'> = window) {
  await sendJson('POST', '/api/logout', undefined, (url, init) => win.fetch(url, init)).catch(() => null);
  win.location.assign('/auth/login');
}
