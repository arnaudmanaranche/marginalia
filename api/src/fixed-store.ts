// Findings of an own review whose code a later push changed (table `fixed_before`): what the review
// line counts as "fixed before the MR" (ADR 0006, Finding outcome). Keyed like `posted`.
export const markFixed = (db: any, key: string, sha: string, at = new Date().toISOString()): boolean =>
  Number(db.prepare('INSERT OR IGNORE INTO fixed_before (key, at, sha) VALUES (?, ?, ?)').run(key, at, sha).changes) > 0;

export const isFixed = (db: any, key: string): boolean => Boolean(db.prepare('SELECT 1 FROM fixed_before WHERE key = ?').get(key));
