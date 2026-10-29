import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGitlabClient } from '../api/src/gitlab-http.mjs';

const reply = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Map(Object.entries(headers)),
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

function clientWith(...steps) {
  const calls = [];
  const pauses = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body, headers: init.headers });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  };
  const client = createGitlabClient({ baseUrl: 'https://gl.test', token: 'tok', fetchFn, sleep: async (ms) => pauses.push(ms) });
  return { client, calls, pauses };
}

test('a request goes to /api/v4 with the token, and a 204 answers null', async () => {
  const { client, calls } = clientWith(reply(204, ''));
  assert.equal(await client.request('/projects/1/x', { method: 'DELETE' }), null);
  assert.equal(calls[0].url, 'https://gl.test/api/v4/projects/1/x');
  assert.equal(calls[0].headers['PRIVATE-TOKEN'], 'tok');
});

test('an error keeps the path, the status and the body, so isNotFound() and the studio can read it', async () => {
  const { client, calls } = clientWith(reply(404, '{"message":"404 Not found"}'));
  await assert.rejects(() => client.request('/a/b'), { message: 'GitLab API /a/b -> 404: {"message":"404 Not found"}' });
  assert.equal(calls.length, 1, 'a 404 is final');
});

test('a read is tried again on 429, 5xx and a dropped connection, pausing as told', async () => {
  const { client, calls, pauses } = clientWith(new TypeError('fetch failed'), reply(429, 'slow', { 'retry-after': '2' }), reply(503, 'down'), reply(200, { ok: 1 }));
  assert.deepEqual(await client.request('/x'), { ok: 1 });
  assert.equal(calls.length, 4);
  assert.deepEqual(pauses, [500, 2000, 2000]);
});

test('it gives up after its retries with the last answer', async () => {
  const { client, calls } = clientWith(reply(502, 'bad gateway'));
  await assert.rejects(() => client.request('/x'), /-> 502: bad gateway/);
  assert.equal(calls.length, 4, 'the try and three retries');
});

test('a write is only repeated when the call was refused (429), never after a 5xx', async () => {
  const post = { method: 'POST', body: '{}' };
  const busy = clientWith(reply(429, 'slow'), reply(200, { ok: 1 }));
  assert.deepEqual(await busy.client.request('/x', post), { ok: 1 });
  assert.equal(busy.calls.length, 2);
  const broken = clientWith(reply(500, 'boom'), reply(200, {}));
  await assert.rejects(() => broken.client.request('/x', post), /-> 500/);
  assert.equal(broken.calls.length, 1);
  const dropped = clientWith(new TypeError('fetch failed'));
  await assert.rejects(() => dropped.client.request('/x', post), /fetch failed/);
  assert.equal(dropped.calls.length, 1);
});

test('paginate follows X-Next-Page, adds per_page, and keeps an existing query string', async () => {
  const { client, calls } = clientWith(reply(200, [1, 2], { 'x-next-page': '2' }), reply(200, [3], { 'x-next-page': '' }));
  assert.deepEqual(await client.paginate('/mrs?state=opened'), [1, 2, 3]);
  assert.deepEqual(calls.map((c) => c.url), [
    'https://gl.test/api/v4/mrs?state=opened&per_page=100&page=1',
    'https://gl.test/api/v4/mrs?state=opened&per_page=100&page=2',
  ]);
});
