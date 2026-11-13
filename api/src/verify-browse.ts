// The `browse` tool of a verification (ADR 0010): one browser step per call, turned into the argv of
// one `agent-browser` command, never a shell line. Pure: the actions, the places a page may be
// opened and the names of the evidence are decided on plain values and tested there.

export const BROWSE_ACTIONS = ['open', 'snapshot', 'click', 'fill', 'press', 'wait', 'evidence'] as const;
export type BrowseAction = (typeof BROWSE_ACTIONS)[number];

export const EVIDENCE_DIR = '/tmp/evidence';
// What a run keeps, by name: the extension is what the studio serves it as.
// `file`: the command writes it in the runner, to be read from there; else its output is the file.
export const EVIDENCE_FILES = [
  { name: 'screenshot.png', kind: 'screenshot' as const, argv: ['screenshot', `${EVIDENCE_DIR}/screenshot.png`], file: `${EVIDENCE_DIR}/screenshot.png` },
  { name: 'console.txt', kind: 'log' as const, argv: ['console'], file: null },
  { name: 'errors.txt', kind: 'log' as const, argv: ['errors'], file: null },
  { name: 'requests.txt', kind: 'log' as const, argv: ['network', 'requests'], file: null },
];
// The page was not reachable yet: the project is still starting.
export const NOT_LISTENING = /ERR_CONNECTION_REFUSED|ECONNREFUSED|ERR_EMPTY_RESPONSE|ERR_CONNECTION_RESET/i;
export const MAX_EVIDENCE_BYTES = 2_000_000;
const MAX_TEXT = 300;

// A page opens only on the runner's own machine, or on a host the approved recipe names: the URL is
// parsed, never matched as text (`http://localhost@evil` is the host `evil`).
export function urlAllowed(raw: unknown, hosts: string[] = []) {
  let u: URL;
  try { u = new URL(String(raw ?? '')); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || hosts.some((h) => h.toLowerCase() === host || (h.startsWith('*.') && host.endsWith(h.slice(1).toLowerCase())));
}

export type BrowseStep = { ok: true; argv: string[] } | { ok: false; error: string };

// A target or a value is one word of the command: it may not look like a flag, so a call cannot
// ask agent-browser for something the tool does not offer (a file to write, a remote browser).
const word = (v: unknown, what: string): { ok: true; value: string } | { ok: false; error: string } => {
  const s = String(v ?? '');
  if (!s || s.length > MAX_TEXT) return { ok: false, error: `${what}: one to ${MAX_TEXT} characters` };
  if (s.startsWith('-')) return { ok: false, error: `${what} may not start with "-"` };
  return { ok: true, value: s };
};

export function browseStep(input: { action?: unknown; target?: unknown; value?: unknown }, hosts: string[] = []): BrowseStep {
  const action = String(input.action ?? '');
  if (!BROWSE_ACTIONS.includes(action as BrowseAction)) return { ok: false, error: `action is one of ${BROWSE_ACTIONS.join(', ')}` };
  if (action === 'snapshot') return { ok: true, argv: ['snapshot', '-i'] };
  if (action === 'evidence') return { ok: true, argv: [] };
  if (action === 'open') return urlAllowed(input.target, hosts) ? { ok: true, argv: ['open', String(input.target)] } : { ok: false, error: 'a page opens only on localhost or a host of the recipe (http or https)' };
  const target = word(input.target, 'target');
  if (!target.ok) return target;
  if (action === 'click' || action === 'wait' || action === 'press') return { ok: true, argv: [action, target.value] };
  const value = word(input.value, 'value');
  return value.ok ? { ok: true, argv: ['fill', target.value, value.value] } : value;
}

// The command that starts the project in the background and waits for it: the recipe's own `run` step.
export const runStep = (steps: { purpose: string; run: string }[]) => steps.find((s) => s.purpose === 'run')?.run ?? null;
