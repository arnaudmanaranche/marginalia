import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { transaction } from './db.ts';
import { migrateState, migratePosted } from './state-shape.ts';
import { writeProjectState, writePosted, insertRun } from './db-store.ts';

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

// Brings the old JSON files (state.json, posted.json, runs.jsonl) into an empty database, once.
// They are left where they are, so going back to an older version still finds them; `meta`
// records that the import happened so a later run never imports them again over newer data.
// Returns what it imported, or null when there was nothing to do.
export function importLegacyFiles(db, dir, firstKey) {
  if (db.prepare("SELECT 1 FROM meta WHERE key = 'legacy_imported'").get()) return null;
  const counts = { projects: 0, posted: 0, runs: 0 };
  transaction(db, () => {
    const state = readJson(join(dir, 'state.json'));
    if (state) {
      const { projects } = migrateState(state, firstKey);
      for (const [key, value] of Object.entries(projects)) {
        writeProjectState(db, key, value);
        counts.projects += 1;
      }
    }
    const posted = readJson(join(dir, 'posted.json'));
    if (posted) {
      const migrated = migratePosted(posted, firstKey);
      writePosted(db, migrated);
      counts.posted = Object.keys(migrated).length;
    }
    const runsFile = join(dir, 'runs.jsonl');
    if (existsSync(runsFile)) {
      for (const line of readFileSync(runsFile, 'utf8').split('\n')) {
        try {
          if (!line.trim()) continue;
          insertRun(db, { project: firstKey ?? null, ...JSON.parse(line) });
          counts.runs += 1;
        } catch { /* a torn line from a crash: skip it */ }
      }
    }
    db.prepare("INSERT INTO meta (key, value) VALUES ('legacy_imported', ?)").run(new Date().toISOString());
  });
  return counts;
}
