// @ts-check
// Sending events to PostHog's capture API (POST <host>/batch/). Small and dependency-free: the
// bot makes about ten events a day. Never throws: telemetry must not be able to hurt a review.

/**
 * @param {{ host: string, key: string, fetchFn?: (url: string, init: any) => Promise<{ ok: boolean, status: number }>, timeoutMs?: number, chunk?: number }} options
 */
export function createPosthogClient({ host, key, fetchFn = (url, init) => fetch(url, init), timeoutMs = 5000, chunk = 100 }) {
  const url = `${host.replace(/\/+$/, '')}/batch/`;
  return {
    /** @param {object[]} events -> { sent, failed, error } */
    async send(events) {
      let sent = 0;
      let failed = 0;
      /** @type {string | null} */
      let error = null;
      for (let i = 0; i < events.length; i += chunk) {
        const batch = events.slice(i, i + chunk);
        try {
          const res = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ api_key: key, batch }), signal: AbortSignal.timeout(timeoutMs) });
          if (res.ok) sent += batch.length;
          else {
            failed += batch.length;
            error = `HTTP ${res.status}`;
          }
        } catch (err) {
          failed += batch.length;
          error = /** @type {Error} */ (err).message;
        }
      }
      return { sent, failed, error };
    },
  };
}

// POSTHOG_HOST (https://eu.i.posthog.com, https://us.i.posthog.com or your own) and POSTHOG_KEY (the
// project API key `phc_...`, which can only write events) turn it on; MARGINALIA_TELEMETRY=off turns
// it off whatever else is set. The host has no default: US and EU are different places.
/** @param {Record<string, string | undefined>} env */
export function posthogFromEnv(env) {
  if (env.MARGINALIA_TELEMETRY === 'off' || !env.POSTHOG_KEY) return { client: null, problem: null };
  if (!env.POSTHOG_HOST) return { client: null, problem: 'POSTHOG_KEY is set but POSTHOG_HOST is not: no events are sent.' };
  return { client: createPosthogClient({ host: env.POSTHOG_HOST, key: env.POSTHOG_KEY }), problem: null };
}
