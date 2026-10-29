import { logger } from './logger.ts';
import { DATA_DIR } from './config.ts';
import { PROJECTS } from './projects.ts';
import { openDatabase } from './db.ts';
import { importLegacyFiles } from './db-import.ts';
import { join } from 'node:path';

export const DB_FILE = join(DATA_DIR, 'marginalia.db');

// The process-wide database, opened (and the old JSON files imported) on first use.
/** @type {import('node:sqlite').DatabaseSync | null} */
let db = null;
export function getDb() {
  if (db) return db;
  const file = process.env.MARGINALIA_DB || DB_FILE;
  db = openDatabase(file);
  const imported = importLegacyFiles(db, DATA_DIR, PROJECTS[0]?.key);
  if (imported) logger.info(`Imported ${imported.projects} project(s) of state, ${imported.posted} posted comment(s) and ${imported.runs} run(s) into ${file}.`);
  return db;
}
