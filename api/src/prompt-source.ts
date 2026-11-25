import { logger } from './logger.ts';
import { BUILT_IN_METHODS, type MethodName } from './pipeline/stage-methods.ts';

// The stage methods a run uses (ADR 0014): the version PostHog prompt management holds under a label
// (`production` unless MARGINALIA_PROMPT_LABEL says otherwise), or a pinned version
// (MARGINALIA_PROMPT_VERSIONS=review-chapter@3,...), else the built-in copy. Never throws, never
// waits longer than its timeout: a run always gets a method. Off unless POSTHOG_PERSONAL_API_KEY (read
// scope on prompts) and POSTHOG_KEY are set; the host is POSTHOG_APP_HOST, or POSTHOG_HOST without its
// `.i.` (prompts are read from the app, not from the ingestion host).

export interface ResolvedMethod {
  name: MethodName;
  text: string;
  version: number | null;
  source: 'posthog' | 'built-in';
}

interface Source { host: string; personalKey: string; projectKey: string; label: string; pins: Map<string, number> }

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { method: ResolvedMethod; at: number }>();

export const builtIn = (name: MethodName): ResolvedMethod => ({ name, text: BUILT_IN_METHODS[name], version: null, source: 'built-in' });

// "review-chapter@3, review-map@2" as name → version; anything else in the list is ignored.
export function parsePins(value: string | undefined): Map<string, number> {
  const pins = new Map<string, number>();
  for (const part of (value ?? '').split(',')) {
    const m = part.trim().match(/^([\w-]+)@(\d+)$/);
    if (m) pins.set(m[1], Number(m[2]));
  }
  return pins;
}

export function promptSourceFromEnv(env: Record<string, string | undefined>): Source | null {
  if (!env.POSTHOG_PERSONAL_API_KEY || !env.POSTHOG_KEY) return null;
  const host = env.POSTHOG_APP_HOST || env.POSTHOG_HOST?.replace(/\/\/(\w+)\.i\.posthog\.com/, '//$1.posthog.com');
  if (!host) return null;
  return { host: host.replace(/\/+$/, ''), personalKey: env.POSTHOG_PERSONAL_API_KEY, projectKey: env.POSTHOG_KEY, label: env.MARGINALIA_PROMPT_LABEL || 'production', pins: parsePins(env.MARGINALIA_PROMPT_VERSIONS) };
}

export function methodUrl(source: Source, name: MethodName): string {
  const pin = source.pins.get(name);
  const which = pin === undefined ? `label=${encodeURIComponent(source.label)}` : `version=${pin}`;
  return `${source.host}/api/environments/@current/llm_prompts/name/${encodeURIComponent(name)}/?token=${encodeURIComponent(source.projectKey)}&${which}`;
}

// PostHog's answer as a method, or why it is not one.
export function methodFromAnswer(name: MethodName, data: any): ResolvedMethod | string {
  if (typeof data?.prompt !== 'string' || !data.prompt.trim()) return 'the answer has no prompt text';
  if (!Number.isInteger(data.version)) return 'the answer has no version';
  return { name, text: data.prompt, version: data.version, source: 'posthog' };
}

async function fetchMethod(source: Source, name: MethodName, fetchFn: typeof fetch, timeoutMs: number): Promise<ResolvedMethod> {
  const url = methodUrl(source, name);
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.method;
  try {
    const res = await fetchFn(url, { headers: { authorization: `Bearer ${source.personalKey}` }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const method = methodFromAnswer(name, await res.json());
    if (typeof method === 'string') throw new Error(method);
    cache.set(url, { method, at: Date.now() });
    return method;
  } catch (err) {
    // A stale copy beats the built-in one: it is the version the team released.
    if (hit) {
      hit.at = Date.now() - TTL_MS + 60_000;
      return hit.method;
    }
    logger.debug({ err, name }, 'Could not fetch a stage method from PostHog: using the built-in one');
    return builtIn(name);
  }
}

// The methods a run uses, resolved once before its first stage so all its stages share the versions.
export async function resolveMethods<N extends MethodName>(names: N[], { env = process.env, fetchFn = fetch, timeoutMs = 5000 }: { env?: Record<string, string | undefined>; fetchFn?: typeof fetch; timeoutMs?: number } = {}): Promise<Record<N, ResolvedMethod>> {
  const source = promptSourceFromEnv(env);
  const resolved = await Promise.all(names.map((name) => (source ? fetchMethod(source, name, fetchFn, timeoutMs) : Promise.resolve(builtIn(name)))));
  return Object.fromEntries(resolved.map((m) => [m.name, m])) as Record<N, ResolvedMethod>;
}

// One step line for the run's journal and the studio: which version of each method this run uses.
export const methodsLine = (methods: ResolvedMethod[]) => `Methods: ${methods.map((m) => `${m.name} ${m.version === null ? 'built-in' : `v${m.version}`}`).join(', ')}`;

export const clearMethodCache = () => cache.clear();
