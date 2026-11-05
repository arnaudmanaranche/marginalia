import { readFileSync } from 'node:fs';

// What the studio showed before the bot restarted, kept until the first pass replaces it: without
// it Home sorts every MR as done and the inbox is empty for the whole first poll. Only the entries
// of projects still watched; a run cut off by the restart is pending again, not reviewing.
export function carryOver(previous: any, projectKeys: string[]): any[] {
  const keys = new Set(projectKeys);
  const mrs = Array.isArray(previous?.mrs) ? previous.mrs : [];
  return mrs
    .filter((m: any) => m && typeof m === 'object' && keys.has(m.project))
    .map((m: any) => (m.status === 'reviewing' ? { ...m, status: 'pending' } : m));
}

// The last status file, or nothing when there is none or it cannot be read.
export function readPrevious(file: string): any {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
