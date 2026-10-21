// The GitLab REST transport: auth, retries and pagination, with no config import so a
// test can hand it a fake `fetch`. gitlab.mjs builds the one client the bot uses.
// (@gitbeaker/rest was evaluated and not adopted: it drops the status and path from
// error messages, which isNotFound() and the studio rely on, retries only 429/502 with a
// sub-millisecond pause, and its draft-note update sends POST where GitLab wants PUT.)

const RETRY_STATUS = new Set([429, 502, 503, 504]);
const MAX_PAGES = 20;
const MAX_PAUSE_MS = 30_000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// How long to sit out before try n+1: the server's Retry-After when it gives one.
export function retryPause(res, attempt) {
  const seconds = Number(res?.headers?.get('retry-after'));
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_PAUSE_MS);
  return 500 * 2 ** attempt;
}

// A 429 was refused before it did anything, so any call may be tried again; a 5xx or a
// dropped connection may have been acted on, so only a read is.
export const canRetry = (method, status) => status === 429 || (method === 'GET' && (status === undefined || RETRY_STATUS.has(status)));

export function createGitlabClient({ baseUrl, token, fetchFn = (...args) => fetch(...args), sleep = wait, retries = 3 }) {
  async function send(path, options = {}) {
    const method = (options.method ?? 'GET').toUpperCase();
    const init = { ...options, headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json', ...(options.headers || {}) } };
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetchFn(`${baseUrl}/api/v4${path}`, init);
      } catch (err) {
        if (attempt >= retries || !canRetry(method, undefined)) throw err;
        await sleep(retryPause(null, attempt));
        continue;
      }
      if (res.ok) return res;
      if (attempt < retries && canRetry(method, res.status)) {
        await sleep(retryPause(res, attempt));
        continue;
      }
      throw new Error(`GitLab API ${path} -> ${res.status}: ${await res.text()}`);
    }
  }

  async function request(path, options = {}) {
    const res = await send(path, options);
    return res.status === 204 ? null : res.json();
  }

  // Every item of a list endpoint: 100 a page, following X-Next-Page (capped, so a runaway
  // list cannot loop). `path` may already carry a query string.
  async function paginate(path) {
    const items = [];
    let page = '1';
    for (let n = 0; page && n < MAX_PAGES; n++) {
      const sep = path.includes('?') ? '&' : '?';
      const res = await send(`${path}${sep}per_page=100&page=${page}`);
      items.push(...(await res.json()));
      page = res.headers.get('x-next-page');
    }
    return items;
  }

  return { request, paginate };
}
