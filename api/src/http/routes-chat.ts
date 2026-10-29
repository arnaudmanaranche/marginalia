import { artifactAt } from '../artifact.ts';
import { askAboutStop } from '../chat.ts';
import { buildChatPrompt, parseChatInput } from '../chat-prompt.ts';
import { filesForPatterns, toDiffFile } from '../mr-diff.ts';
import { gitlab } from '../gitlab-api.ts';
import { ChatAnswer, ChatRequest } from '@worldia/marginalia-contract';
import { jsonBody, jsonOf, route } from './route-kit.ts';
import { locate, shortMessage } from './context.ts';
import { notTracked } from './read-kit.ts';

// One chat question at a time: each is a Claude run with a cost.
let chatBusy = false;

export function chatRoute(app) {
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
}
