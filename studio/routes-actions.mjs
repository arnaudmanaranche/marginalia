// @ts-check
import { loadState, saveState } from '../lib/state.mjs';
import { artifactAt } from '../lib/artifact.mjs';
import { askAboutStop } from '../lib/chat.mjs';
import { buildChatPrompt, parseChatInput } from '../lib/chat-prompt.mjs';
import { filesForPatterns, toDiffFile } from '../lib/mr-diff.mjs';
import { gitlab } from '../lib/gitlab-api.mjs';
import { fixesStatus, pushFixes } from '../lib/fixes.mjs';
import { pushOneFix } from '../lib/fixes-push.mjs';
import { envDefaults, saveSettings } from '../lib/settings.mjs';
import { BotState, ChatAnswer, ChatRequest, FixesStatus, Ok, PushRequest, Rerun, ReviewId, SettingsAnswer, SettingsPatch, SlugBody } from './schemas.mjs';
import { z } from '@hono/zod-openapi';
import { jsonBody, jsonOf, route } from './route-kit.mjs';
import { locate, readStatus, serialQueue, shortMessage } from './context.mjs';

const notTracked = (c) => c.json({ error: 'no tracked merge request for this review' }, 404);

// Whether the poller that wrote status.json is still running. The studio runs next to it (same
// machine or same container), so its pid means something here, unlike from outside a container.
function pollerAlive(status) {
  try {
    return Boolean(status?.pid) && status.phase !== 'stopped' && process.kill(status.pid, 0);
  } catch {
    return false;
  }
}

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
    const shape = await artifactAt(project.reviewsDir, found.slug).readShape();
    const stop = (shape.tour ?? []).find((s) => s.id === stopId);
    if (!stop) return c.json({ error: 'no such stop in this review' }, 404);
    if (chatBusy) return c.json({ error: 'another question is being answered, try again in a moment' }, 429);
    chatBusy = true;
    try {
      const files = filesForPatterns((await gitlab.listMergeRequestDiffs(project, mr.iid)).map(toDiffFile), stop.files);
      const prompt = buildChatPrompt({ title: mr.title, shape, stop, files, history, question });
      return c.json({ answer: await askAboutStop({ project, iid: mr.iid, prompt }) }, 200);
    } catch (err) {
      return c.json({ error: shortMessage(err) }, 502);
    } finally {
      chatBusy = false;
    }
  });

  // The bot's status for the menu bar, which may not see the poller's process (a container).
  app.openapi(route({
    method: 'get', path: '/api/status', tags: ['Reviews'], operationId: 'getStatus',
    summary: 'The bot\'s status and whether it is running', description: 'Light: `status.json` as is, plus `alive`. For the menu bar.',
    responses: { 200: jsonOf(BotState, 'The status.') },
  }), async (c) => {
    const status = await readStatus();
    return c.json({ status, alive: pollerAlive(status) }, 200);
  });

  // "Poll now": nudges the poller with SIGUSR1, from wherever the menu bar runs.
  app.openapi(route({
    method: 'post', path: '/api/poll', tags: ['Reviews'], operationId: 'pollNow',
    summary: 'Poll now', responses: { 200: jsonOf(Ok, 'The poller was nudged.') }, errors: [403, 409],
  }), async (c) => {
    const status = await readStatus();
    if (!pollerAlive(status)) return c.json({ error: 'the bot is not running' }, 409);
    if (status.phase === 'polling' || status.phase === 'reviewing') return c.json({ error: 'a poll is already running' }, 409);
    process.kill(status.pid, 'SIGUSR1');
    return c.json({ ok: true }, 200);
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
    if (!pollerAlive(status)) return c.json({ error: 'the bot is not running: start it with npm start' }, 409);
    if (status.phase !== 'idle' && status.phase !== 'error') return c.json({ error: 'a run is in progress, try again when it is done' }, 409);
    const state = await loadState(project);
    if (mr.kind === 'comments') state.mineComments[mr.iid] = null;
    else state[mr.iid] = null;
    await saveState(project, state);
    process.kill(status.pid, 'SIGUSR1');
    return c.json({ ok: true, iid: mr.iid, kind: mr.kind }, 200);
  });

  // Where the local fixes of one triage stand against its MR branch on origin.
  app.openapi(route({
    method: 'get', path: '/api/fixes/{slug}', tags: ['Triage fixes'], operationId: 'getFixes',
    summary: 'Where a triage\'s fixes stand', description: '`ready` (on top of the MR head, can be pushed), `pushed`, `outdated` (the branch moved since) or `none`.',
    request: { params: z.object({ slug: ReviewId }) },
    responses: { 200: jsonOf(FixesStatus, 'The fixes against the MR branch.') }, errors: [400, 404, 502],
  }), async (c) => {
    const found = await locate(c.req.valid('param').slug);
    const mr = found?.mr;
    if (!found || mr?.kind !== 'comments' || !mr.sourceBranch) return c.json({ error: 'no tracked triage for this slug' }, 404);
    try {
      return c.json(await fixesStatus(found.project, { iid: mr.iid, source_branch: mr.sourceBranch }), 200);
    } catch (err) {
      return c.json({ error: shortMessage(err) }, 502);
    }
  });

  // Pushes the local fixes of one triage to its MR branch, only if that branch hasn't moved since
  // (fast-forward).
  app.openapi(route({
    method: 'post', path: '/api/push', tags: ['Triage fixes'], operationId: 'pushFixes',
    summary: 'Push a triage\'s fixes to the MR branch', description: 'Only on your own merge request (a `comments` triage). Fast-forward only. With `sha`, that one fix alone: the others are replayed on top of it, still to push.',
    request: { body: jsonBody(PushRequest) },
    responses: { 200: jsonOf(FixesStatus, 'Pushed; the status after the push.') }, errors: [400, 403, 404, 409, 415, 502],
  }), (c) => pushQueue(async () => {
    const { slug, sha } = c.req.valid('json');
    const found = await locate(slug);
    const mr = found?.mr;
    if (!found || mr?.kind !== 'comments' || !mr.sourceBranch) return c.json({ error: 'no tracked triage for this slug' }, 404);
    const target = { iid: mr.iid, source_branch: mr.sourceBranch };
    try {
      if (sha) {
        const one = await pushOneFix(found.project, target, sha);
        if (!one.pushed) return c.json({ error: one.error, status: one.status }, 409);
        return c.json(one.status, 200);
      }
      const { pushed, status } = await pushFixes(found.project, target);
      if (!pushed) return c.json({ error: status.state === 'outdated' ? 'the MR branch moved since the triage: re-run it' : `nothing to push (${status.state})`, status }, 409);
      return c.json(status, 200);
    } catch (err) {
      return c.json({ error: String(err.stderr || err.message).trim().slice(0, 300) }, 502);
    }
  }));
}
