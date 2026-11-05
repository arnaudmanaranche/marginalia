import { postedKey } from './state-shape.ts';

// Findings a person decided not to say (table `dismissed`): an approval that answered no (ADR 0006).
// Keyed like `posted`, so a finding is posted, dismissed or still proposed, never two of these.
export const dismissFinding = (db: any, project: string, slug: string, id: string, by: string, at = new Date().toISOString()) => {
  db.prepare('INSERT INTO dismissed (key, at, by) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET at = excluded.at, by = excluded.by').run(postedKey(project, slug, id), at, by);
};

export const restoreFinding = (db: any, project: string, slug: string, id: string) => {
  db.prepare('DELETE FROM dismissed WHERE key = ?').run(postedKey(project, slug, id));
};

// Every dismissed key, for the inbox to leave them out.
export const dismissedKeys = (db: any): Set<string> => new Set(db.prepare('SELECT key FROM dismissed').all().map((r: any) => String(r.key)));

// Each dismissal with when it was decided, for the line's measure.
export const dismissedRows = (db: any): { key: string; at: string }[] => db.prepare('SELECT key, at FROM dismissed').all().map((r: any) => ({ key: String(r.key), at: String(r.at) }));
