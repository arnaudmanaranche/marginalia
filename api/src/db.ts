import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './db-schema.ts';

// One SQLite file holds what the bot remembers: what it reviewed, what was posted from
// the studio, what each run cost. The poller and the studio share this process, so a
// single connection is enough; WAL keeps a reader (a second tool, the sqlite3 shell) off the writer.
export function openDatabase(file) {
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  const version = Number(/** @type {{ user_version: number }} */ (db.prepare('PRAGMA user_version').get()).user_version);
  if (version > MIGRATIONS.length) {
    throw new Error(`${file} was written by a newer Marginalia (schema ${version}, this one knows ${MIGRATIONS.length}): update it.`);
  }
  for (let v = version; v < MIGRATIONS.length; v += 1) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return db;
}

// All or nothing; the error of `fn` is rethrown after the rollback. Nested calls become
// savepoints, so a function that is a transaction on its own can run inside another.
const depths = new WeakMap();
export function transaction(db, fn) {
  const depth = depths.get(db) ?? 0;
  const name = `sp${depth}`;
  db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`);
  depths.set(db, depth + 1);
  try {
    const result = fn();
    db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
    return result;
  } catch (err) {
    db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
    throw err;
  } finally {
    depths.set(db, depth);
  }
}
