import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clearMethodCache, methodUrl, methodsLine, parsePins, promptSourceFromEnv, resolveMethods } from '../dist/src/prompt-source.js';
import { BUILT_IN_METHODS } from '../dist/src/pipeline/stage-methods.js';
import { claudeEnv } from '../dist/src/claude-cli.js';

const env = { POSTHOG_PERSONAL_API_KEY: 'phs_x', POSTHOG_KEY: 'phc_y', POSTHOG_HOST: 'https://eu.i.posthog.com' };
const answer = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });
beforeEach(() => clearMethodCache());

test('off without both keys: every method is the built-in one, and nothing is fetched', async () => {
  let fetched = 0;
  const m = await resolveMethods(['review-map'], { env: { POSTHOG_KEY: 'phc_y', POSTHOG_HOST: 'https://eu.i.posthog.com' }, fetchFn: async () => { fetched++; } });
  assert.equal(fetched, 0);
  assert.deepEqual(m['review-map'], { name: 'review-map', text: BUILT_IN_METHODS['review-map'], version: null, source: 'built-in' });
});

test('prompts are read from the app host, by label unless a version is pinned', () => {
  const s = promptSourceFromEnv(env);
  assert.equal(s.host, 'https://eu.posthog.com');
  assert.equal(s.label, 'production');
  assert.equal(methodUrl(s, 'review-map'), 'https://eu.posthog.com/api/environments/@current/llm_prompts/name/review-map/?token=phc_y&label=production');
  const pinned = promptSourceFromEnv({ ...env, POSTHOG_APP_HOST: 'https://ph.example.com/', MARGINALIA_PROMPT_VERSIONS: 'review-map@3, junk' });
  assert.equal(methodUrl(pinned, 'review-map'), 'https://ph.example.com/api/environments/@current/llm_prompts/name/review-map/?token=phc_y&version=3');
  assert.deepEqual([...parsePins('a@1,b@x, c@2')], [['a', 1], ['c', 2]]);
});

test('a method PostHog holds is used with its version, and asked for with the personal key', async () => {
  let auth;
  const m = await resolveMethods(['review-chapter'], { env, fetchFn: async (url, init) => { auth = init.headers.authorization; return { ok: true, json: async () => ({ prompt: 'Cite the rule.', name: 'review-chapter', version: 7 }) }; } });
  assert.equal(auth, 'Bearer phs_x');
  assert.deepEqual(m['review-chapter'], { name: 'review-chapter', text: 'Cite the rule.', version: 7, source: 'posthog' });
  assert.equal(methodsLine(Object.values(m)), 'Methods: review-chapter v7');
});

test('an error, a timeout, a missing prompt or an empty one falls back to the built-in method', async () => {
  for (const fetchFn of [answer({}, 500), answer({}, 404), answer({ prompt: '  ', version: 2 }), answer({ prompt: 'x' }), async () => { throw new Error('timeout'); }]) {
    clearMethodCache();
    const m = await resolveMethods(['triage-judge'], { env, fetchFn });
    assert.equal(m['triage-judge'].source, 'built-in');
    assert.equal(m['triage-judge'].text, BUILT_IN_METHODS['triage-judge']);
  }
});

test('a method fetched once is served from the cache, and kept when PostHog fails later', async () => {
  let calls = 0;
  const ok = async () => { calls++; return { ok: true, json: async () => ({ prompt: 'v5 text', version: 5 }) }; };
  await resolveMethods(['review-map'], { env, fetchFn: ok });
  await resolveMethods(['review-map'], { env, fetchFn: ok });
  assert.equal(calls, 1);
});

test('the prompt key never reaches the agent', () => {
  const out = claudeEnv({ ...env, PATH: '/bin' });
  assert.equal(out.POSTHOG_PERSONAL_API_KEY, undefined);
  assert.equal(out.PATH, '/bin');
});
