import { randomToken, seal, unseal, SESSION_DAYS } from './auth.ts';
import type { Tokens } from './auth-gitlab.ts';

// Sessions of the signed-in studio, in table `session`: the person, the projects they may use and
// their GitLab tokens (sealed). The cookie holds only the random id.
export interface Session { id: string; username: string; name: string; projects: string[]; tokens: Tokens }

export function createSession(db, secret: string, { username, name, projects, tokens }: Omit<Session, 'id'>, now = Date.now()): string {
  const id = randomToken();
  db.prepare('INSERT INTO session (id, username, name, projects, tokens, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, username, name, JSON.stringify(projects), seal(JSON.stringify(tokens), secret), now + SESSION_DAYS * 86_400_000);
  return id;
}

export function readSession(db, secret: string, id: string, now = Date.now()): Session | null {
  const row = db.prepare('SELECT * FROM session WHERE id = ?').get(id);
  if (!row) return null;
  const tokens = row.expires_at > now ? unseal(row.tokens, secret) : null;
  if (!tokens) { deleteSession(db, id); return null; }
  return { id, username: row.username, name: row.name, projects: JSON.parse(row.projects), tokens: JSON.parse(tokens) };
}

export const updateTokens = (db, secret: string, id: string, tokens: Tokens) => { db.prepare('UPDATE session SET tokens = ? WHERE id = ?').run(seal(JSON.stringify(tokens), secret), id); };
export const deleteSession = (db, id: string) => { db.prepare('DELETE FROM session WHERE id = ?').run(id); };
export const purgeSessions = (db, now = Date.now()) => { db.prepare('DELETE FROM session WHERE expires_at <= ?').run(now); };
