import { loadState, saveState } from '../state.ts';
import { envDefaults, saveSettings } from '../settings.ts';
import { BotState, Ok, Rerun, SettingsAnswer, SettingsPatch, SlugBody } from '@worldia/marginalia-contract';
import { jsonBody, jsonOf, route } from './route-kit.ts';
import { locate, readStatus } from './context.ts';
import { notTracked } from './read-kit.ts';
import { pollerAlive } from './poller-alive.ts';

// Controlling the bot: its settings, its status, polling now and re-running one MR.
export function botRoutes(app: any) {
  app.openapi(route({
    method: 'put', path: '/api/settings', tags: ['Settings'], operationId: 'putSettings',
    summary: 'Change settings', description: 'Saved to `settings.json`; the poller picks it up at once. Applies to every project.',
    request: { body: jsonBody(SettingsPatch) }, responses: { 200: jsonOf(SettingsAnswer, 'The settings now in force, and the defaults.') }, errors: [400, 403, 415],
  }), async (c: any) => {
    try {
      return c.json({ settings: await saveSettings(c.req.valid('json')), defaults: envDefaults() }, 200);
    } catch (err) {
      return c.json({ error: String(err.message) }, 400);
    }
  });

  // The bot's status for the menu bar, which may not see the poller's process (a container).
  app.openapi(route({
    method: 'get', path: '/api/status', tags: ['Reviews'], operationId: 'getStatus',
    summary: 'The bot\'s status and whether it is running', description: 'Light: `status.json` as is, plus `alive`. For the menu bar.',
    responses: { 200: jsonOf(BotState, 'The status.') },
  }), async (c: any) => {
    const status = await readStatus();
    return c.json({ status, alive: pollerAlive(status) }, 200);
  });

  // "Poll now": nudges the poller with SIGUSR1, from wherever the menu bar runs.
  app.openapi(route({
    method: 'post', path: '/api/poll', tags: ['Reviews'], operationId: 'pollNow',
    summary: 'Poll now', responses: { 200: jsonOf(Ok, 'The poller was nudged.') }, errors: [403, 409],
  }), async (c: any) => {
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
  }), async (c: any) => {
    const found = await locate(c.req.valid('json').slug);
    if (!found?.mr) return notTracked(c);
    const { project, mr, status } = found;
    if (!pollerAlive(status)) return c.json({ error: 'the bot is not running: start it with npm start' }, 409);
    if (status.phase !== 'idle' && status.phase !== 'error') return c.json({ error: 'a run is in progress, try again when it is done' }, 409);
    const state: any = await loadState(project);
    if (mr.kind === 'comments') state.mineComments[mr.iid] = null;
    else state[mr.iid] = null;
    await saveState(project, state);
    process.kill(status.pid, 'SIGUSR1');
    return c.json({ ok: true, iid: mr.iid, kind: mr.kind }, 200);
  });
}
