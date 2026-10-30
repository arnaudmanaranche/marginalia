// The JSON an agent answers with: the last ```json block of its final message, else the outermost
// object in it. Pure.

/** @param {string} text @returns {{ ok: true, value: any } | { ok: false, error: string }} */
export function jsonAnswer(text: unknown) {
  const blocks = [...String(text ?? '').matchAll(/```json\s*([\s\S]*?)```/g)];
  const raw = blocks.at(-1)?.[1] ?? String(text ?? '').match(/\{[\s\S]*\}/)?.[0];
  if (!raw) return { ok: false, error: 'there is no JSON in the answer' };
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? { ok: true, value } : { ok: false, error: 'the JSON is not an object' };
  } catch (err) {
    return { ok: false, error: `the JSON does not parse (${String(err.message).slice(0, 80)})` };
  }
}

export const text = (v: unknown, max = 4000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

// `**` any depth, `*` within one folder: how a chapter names a group of files.
/** @param {string} pattern @param {string} path */
export function matchesPattern(pattern: string, path: string) {
  if (!/[*?]/.test(pattern)) return pattern === path || path.startsWith(`${pattern.replace(/\/$/, '')}/`);
  const re = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*');
  return new RegExp(`^${re}$`).test(path);
}
