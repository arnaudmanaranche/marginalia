// @ts-check
import { loadState, saveState } from '../lib/state.mjs';
import { loadShape } from '../lib/findings.mjs';
import { askAboutStop } from '../lib/chat.mjs';
import { buildChatPrompt, parseChatInput } from '../lib/chat-prompt.mjs';
import { filesForPatterns, toDiffFile } from '../lib/mr-diff.mjs';
import { listMergeRequestDiffs } from '../lib/gitlab.mjs';
import { pushFixes } from '../lib/fixes.mjs';
import { envDefaults, saveSettings } from '../lib/settings.mjs';
import { ChatAnswer, ChatRequest, FixesStatus, Rerun, SettingsAnswer, SettingsPatch, SlugBody } from './schemas.mjs';
import { jsonBody, jsonOf, route } from './route-kit.mjs';
import { locate, serialQueue, shortMessage } from './context.mjs';

const notTracked = (c) => c.json({ error: 'no tracked merge request for this review' }, 404);

// One chat question at a time: each is a Claude run with a cost.
let chatBusy = false;
// Two clicks must not race on the same push.
const pushQueue = serialQueue();

export function actionRoutes(app) {
  app.openapi(route({
    method: 'put', path: '/api/settings', tags: ['Settings'], operationId: 'putSettings',
    summary: 'Change settings', description: 'Saved to `settings.json`; the poller picks it up at once. Applies to every project.',
    request: { body: jsonBody(SettingsPatch) }, responses: { 200: jsonOf(SettingsAnswer, 'The settings now in force, and the defaults.') }, errors: [400, 403, 415],
  }), async (c) => {
    try {
      return c.json({ settings: await saveSettings(c.req.valid('json')), defaults: envDefaults() }, 200);
    } catch (err) {
      return c.json({ error: String(err.message) }, 400);
    }
  });

  app.openapi(route({
    method: 'post', path: '/api/chat', tags: ['Reviews'], operationId: 'askAboutStop',
    summary: 'Ask about a stop of the tour',
    description: 'One question to a headless, read-only Claude, with the stop\'s diff in its prompt. Costs a run; one at a time.',
    request: { body: jsonBody(ChatRequest) }, responses: { 200: jsonOf(ChatAnswer, 'The answer. Never posted.') }, errors: [400, 403, 404, 415, 429, 502],
  }), async (c) => {
    const parsed = parseChatInput(c.req.valid('json'));
    if (parsed.error) return c.json({ error: parsed.error }, 400);
    const { slug, stopId, question, history } = parsed;
    const found = await locate(slug);
    if (!found?.mr) return notTracked(c);
    const { project, mr } = found;
    const shape = await loadShape(project.reviewsDir, found.slug, '');
    const stop = (shape.tour ?? []).find((s) => s.id === stopId);
    if (!stop) return c.json({ error: 'no such stop in this review' }, 404);
    if (chatBusy) return c.json({ error: 'another question is being answered, try again in a moment' }, 429);
    chatBusy = true;
    try {
      const files = filesForPatterns((await listMergeRequestDiffs(project, mr.iid)).map(toDiffFile), stop.files);
      const prompt = buildChatPrompt({ title: mr.title, shape, stop, files, history, question });
      return c.json({ answer: await askAboutStop({ project, iid: mr.iid, prompt }) }, 200);
    } catch (err) {
      return c.json({ error: shortMessage(err) }, 502);
    } finally {
      chatBusy = false;
    }
  });

  // Re-runs the review (or the comment triage, for my own MRs) of one tracked MR. The poller skips
  // an MR whose recorded SHA matches its head, so the entry is set to null (not deleted: an absent
  // entry would let it trust an existing review file) and the poller is nudged with SIGUSR1, the
  // same signal as the menu bar's "Poll now". State is only edited while the poller is idle: a
  // running poll holds its own copy in memory and would overwrite the change when it saves.
  app.openapi(route({
    method: 'post', path: '/api/rerun', tags: ['Reviews'], operationId: 'rerunReview',
    summary: 'Queue a fresh review of one MR', request: { body: jsonBody(SlugBody) },
    responses: { 200: jsonOf(Rerun, 'Queued; the poller was nudged.') }, errors: [400, 403, 404, 409, 415],
  }), async (c) => {
    const found = await locate(c.req.valid('json').slug);
    if (!found?.mr) return notTracked(c);
    const { project, mr, status } = found;
    let alive = false;
    try {
      alive = Boolean(status?.pid) && process.kill(status.pid, 0);
    } catch {
      /* no such process */
    }
    if (!alive || status.phase === 'stopped') return c.json({ error: 'the bot is not running: start it with npm start' }, 409);
    if (status.phase !== 'idle' && status.phase !== 'error') return c.json({ error: 'a run is in progress, try again when it is done' }, 409);
    const state = await loadState(project);
    if (mr.kind === 'comments') state.mineComments[mr.iid] = null;
    else state[mr.iid] = null;
    await saveState(project, state);
    process.kill(status.pid, 'SIGUSR1');
    return c.json({ ok: true, iid: mr.iid, kind: mr.kind }, 200);
  });

  // Pushes the local fixes of one triage to its MR branch, only if that branch hasn't moved since
  // (fast-forward).
  app.openapi(route({
    method: 'post', path: '/api/push', tags: ['Triage fixes'], operationId: 'pushFixes',
    summary: 'Push a triage\'s fixes to the MR branch', description: 'Requires `ALLOW_PUSH=true`. Fast-forward only.',
    request: { body: jsonBody(SlugBody) },
    responses: { 200: jsonOf(FixesStatus, 'Pushed; the status after the push.') }, errors: [400, 403, 404, 409, 415, 502],
  }), (c) => pushQueue(async () => {
    const found = await locate(c.req.valid('json').slug);
    const mr = found?.mr;
    if (!found || mr?.kind !== 'comments' || !mr.sourceBranch) return c.json({ error: 'no tracked triage for this slug' }, 404);
    try {
      const { pushed, status } = await pushFixes(found.project, { iid: mr.iid, source_branch: mr.sourceBranch });
      if (!pushed) return c.json({ error: status.state === 'outdated' ? 'the MR branch moved since the triage: re-run it' : `nothing to push (${status.state})`, status }, 409);
      return c.json(status, 200);
    } catch (err) {
      return c.json({ error: String(err.stderr || err.message).trim().slice(0, 300) }, 502);
    }
  }));
}
