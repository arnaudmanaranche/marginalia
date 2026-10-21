import { DATA_DIR } from './config.mjs';
import { PROJECTS } from './projects.mjs';
import { openDatabase } from './db.mjs';
import { importLegacyFiles } from './db-import.mjs';
import { join } from 'node:path';

export const DB_FILE = join(DATA_DIR, 'marginalia.db');

// The process-wide database, opened (and the old JSON files imported) on first use.
let db = null;
export function getDb() {
  if (db) return db;
  const file = process.env.MARGINALIA_DB || DB_FILE;
  db = openDatabase(file);
  const imported = importLegacyFiles(db, DATA_DIR, PROJECTS[0]?.key);
  if (imported) console.log(`Imported ${imported.projects} project(s) of state, ${imported.posted} posted comment(s) and ${imported.runs} run(s) into ${file}.`);
  return db;
}
