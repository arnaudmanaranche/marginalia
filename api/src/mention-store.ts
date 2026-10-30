// What the intake remembers (table `mention`, key `mention-cursor:<project>` in `meta`): which
// notes it has handled, so one note runs once whichever intake brought it, how many runs mentions
// started today, and how far the polling intake has read.
export const markMention = (db, project: string, { noteId, at, outcome }: { noteId: number; at: string; outcome: string }) => {
  db.prepare('INSERT OR IGNORE INTO mention (project, note_id, at, outcome) VALUES (?, ?, ?, ?)').run(project, noteId, at, outcome);
};

export const seenMentionIds = (db, project: string): Set<number> => new Set(db.prepare('SELECT note_id FROM mention WHERE project = ?').all(project).map((r) => Number(r.note_id)));

// Runs started by a mention, all projects, since `sinceIso`: what the daily cap counts.
export const mentionRunsSince = (db, sinceIso: string): number => Number(db.prepare("SELECT COUNT(*) AS n FROM mention WHERE outcome = 'ran' AND at >= ?").get(sinceIso)?.n ?? 0);

export const readCursor = (db, project: string): string | null => (db.prepare('SELECT value FROM meta WHERE key = ?').get(`mention-cursor:${project}`)?.value as string | undefined) ?? null;
export const writeCursor = (db, project: string, iso: string) => {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(`mention-cursor:${project}`, iso);
};
