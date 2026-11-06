// Where the verify agent may put a file in the runner's copy of the project (ADR 0009): a new
// file, never an existing one, so a reproduction cannot edit the code under test to make a finding
// come true. Pure: the path rule, tested on plain values.

const SEGMENT = /^[\w@.+-]+$/;
const FORBIDDEN_FIRST = new Set(['.git', '.claude', 'node_modules']);
export const MAX_FILE_BYTES = 100_000;

// The relative path to create, or the reason it is refused.
export function newFilePath(rel: unknown): { ok: true; path: string } | { ok: false; error: string } {
  const path = String(rel ?? '').trim();
  if (!path || path.length > 200) return { ok: false, error: 'a path of one to 200 characters, relative to the project root' };
  if (path.startsWith('/') || path.includes('\\')) return { ok: false, error: 'the path must be relative, with forward slashes' };
  const parts = path.split('/');
  if (parts.some((p) => p === '.' || p === '..' || !SEGMENT.test(p))) return { ok: false, error: 'the path has a segment that is empty, "." or "..", or an odd character' };
  if (FORBIDDEN_FIRST.has(parts[0])) return { ok: false, error: `nothing is created under ${parts[0]}` };
  return { ok: true, path };
}
