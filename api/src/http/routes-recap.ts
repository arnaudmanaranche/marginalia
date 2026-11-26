import { RecapResponse } from '@worldia/marginalia-contract';
import { liveSources } from '../recap-sources.ts';
import { reviewRecap } from '../review-recap.ts';
import { jsonOf, route } from './route-kit.ts';
import { shortMessage } from './context.ts';
import { slug, tracked } from './read-kit.ts';

// What changed on a re-reviewed merge request since its baseline, at a glance.
export function recapRoutes(app: any) {
  app.openapi(route({
    method: 'get', path: '/api/reviews/{slug}/recap', tags: ['Reviews'], operationId: 'getRecap',
    summary: 'What changed since the baseline',
    description: 'The MR\'s own change since the report you last submitted from (or, with nothing submitted, the report before this one), where each comment you posted stands, and the findings that are new, reworded or gone. `recap` is null when there is nothing to compare: a first review.',
    request: { params: slug }, responses: { 200: jsonOf(RecapResponse, 'The recap.') }, errors: [400, 404, 502],
  }), async (c: any) => {
    const id = c.req.valid('param').slug;
    const found = await tracked(c, id);
    if (found.reply) return found.reply;
    try {
      return c.json(await reviewRecap(liveSources(found.project, found.mr, found.slug!, id)), 200);
    } catch (err) {
      return c.json({ error: shortMessage(err) }, 502);
    }
  });
}
