// Where the evidence of a reproduction lives and how it is read back (ADR 0010): a folder per verification
// stage in the data directory, a manifest the browse tool wrote, and the API path each file is served at.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const evidenceId = (runId: string, stage: string) => `${runId}-${stage}`.replace(/[^\w-]/g, '-').slice(0, 120);
// Under the project it belongs to: who may see the project may see its evidence, nobody else (a run id is
// a timestamp, not a secret).
export const evidenceFolder = (dataDir: string, project: string, id: string) => join(dataDir, 'evidence', project, id);
export const evidenceRef = (project: string, id: string, name: string) => `/api/evidence/${project}/${id}/${name}`;

const SERVED: Record<string, string> = { png: 'image/png', txt: 'text/plain; charset=utf-8' };
// The type a file is served as, or null: only the names the browse tool writes are ever served.
export const evidenceType = (name: string) => (/^[\w-]{1,40}\.(png|txt)$/.test(name) ? SERVED[name.split('.').pop()!] : null);

// What the browse tool kept, as artifacts with their refs; none when it kept nothing or the manifest is unreadable.
// A manifest that is not there means nothing was kept; one that cannot be read is an error to report.
export async function readEvidence(folder: string, project: string, id: string) {
  let raw: string;
  try { raw = await readFile(join(folder, 'evidence.json'), 'utf8'); } catch (err: any) { if (err.code === 'ENOENT') return []; throw err; }
  const kept = JSON.parse(raw);
  return (Array.isArray(kept) ? kept : []).filter((a) => evidenceType(String(a?.name))).map((a) => ({ kind: a.kind, name: a.name, ref: evidenceRef(project, id, a.name) }));
}
