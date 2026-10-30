import { logger } from './logger.ts';
import { getDb } from './store.ts';
import { insertRun } from './db-store.ts';

// One row per Claude run, to know what the automatic pass and the on-demand passes really
// cost (`sqlite3 marginalia.db 'select * from run'`). Never fatal: a failed write only
// loses a log line. Returns the row as written (null when it could not be), for telemetry.
export async function appendRun(entry: any) {
  try {
    const row = { at: new Date().toISOString(), ...entry };
    insertRun(getDb(), row);
    return row;
  } catch (err) {
    logger.error({ err }, 'Could not record the run');
    return null;
  }
}
