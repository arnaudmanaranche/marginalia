// @ts-check
import { logger } from './logger.mjs';
import { getDb } from './store.mjs';
import { insertRun } from './db-store.mjs';

// One row per Claude run, to know what the automatic pass and the on-demand passes really
// cost (`sqlite3 marginalia.db 'select * from run'`). Never fatal: a failed write only
// loses a log line.
export async function appendRun(entry) {
  try {
    insertRun(getDb(), { at: new Date().toISOString(), ...entry });
  } catch (err) {
    logger.error({ err }, 'Could not record the run');
  }
}
