import { transaction } from './db.ts';

// The queries behind state.ts, posted.ts and runlog.ts, on a given database so
// they are tested on an in-memory one. The shapes in and out are the ones the
// JSON files had (see state-shape.ts); only where they live changed.
const KINDS = { sha: null, peer: 'mineComments', below: 'stackBelow' };

// { <iid>: sha, mineComments: { <iid>: t }, stackBelow: { <iid>: sha } } of one project.
export function readProjectState(db: any, project: any) {
  const state = { mineComments: {}, stackBelow: {} };
  const rows = db.prepare('SELECT kind, iid, value FROM state_entry WHERE project = ?').all(project);
  for (const { kind, iid, value } of rows) {
    const target = (KINDS as any)[kind] ? (state as any)[(KINDS as any)[kind]] : state;
    (target as any)[iid] = JSON.parse(value);
  }
  return state;
}

export function writeProjectState(db: any, project: any, state: any) {
  const insert = db.prepare('INSERT INTO state_entry (project, kind, iid, value) VALUES (?, ?, ?, ?)');
  transaction(db, () => {
    db.prepare('DELETE FROM state_entry WHERE project = ?').run(project);
    for (const [iid, value] of Object.entries(state)) {
      if (iid !== 'mineComments' && iid !== 'stackBelow') insert.run(project, 'sha', iid, JSON.stringify(value));
    }
    for (const [iid, value] of Object.entries(state.mineComments ?? {})) insert.run(project, 'peer', iid, JSON.stringify(value));
    for (const [iid, value] of Object.entries(state.stackBelow ?? {})) insert.run(project, 'below', iid, JSON.stringify(value));
  });
}

export function readPosted(db: any) {
  return Object.fromEntries(db.prepare('SELECT key, data FROM posted').all().map((r: any) => [r.key, JSON.parse(r.data)]));
}

export const upsertPosted = (db: any, key: string, info: any) => {
  db.prepare('INSERT INTO posted (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data').run(key, JSON.stringify(info));
};

export const deletePosted = (db: any, key: string) => {
  db.prepare('DELETE FROM posted WHERE key = ?').run(key);
};

// Makes the table equal to `posted`: only the rows that changed are written.
export function writePosted(db: any, posted: any) {
  transaction(db, () => {
    const upsert = db.prepare('INSERT INTO posted (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data WHERE data <> excluded.data');
    for (const key of db.prepare('SELECT key FROM posted').all().map((r: any) => r.key)) {
      if (!(key in posted)) db.prepare('DELETE FROM posted WHERE key = ?').run(key);
    }
    for (const [key, info] of Object.entries(posted)) upsert.run(key, JSON.stringify(info));
  });
}

export function insertRun(db: any, { at, project = null, ...rest }: any) {
  db.prepare('INSERT INTO run (at, project, data) VALUES (?, ?, ?)').run(at, project, JSON.stringify(rest));
}

export const readRuns = (db: any) => db.prepare('SELECT at, project, data FROM run ORDER BY id').all().map((r: any) => ({ at: r.at, project: r.project, ...JSON.parse(r.data) }));

// How many passes of this kind this MR has had, the one just recorded included.
export const countRuns = (db: any, { project, iid, kind }: any) => Number(db.prepare(
  "SELECT COUNT(*) AS n FROM run WHERE project IS ? AND json_extract(data, '$.iid') = ? AND json_extract(data, '$.kind') = ?",
).get(project ?? null, iid, kind)?.n ?? 0);
