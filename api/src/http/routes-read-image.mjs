// @ts-check
import { z } from '@hono/zod-openapi';
import { GITLAB_BASE_URL, GITLAB_TOKEN } from '../config.mjs';
import { PROJECTS } from '../projects.mjs';
import { projectOfUpload } from '../review-id.mjs';
import { uploadFetchPath } from '../gitlab-upload.mjs';
import { route } from './route-kit.mjs';

export function imageRoute(app) {
  // An image a GitLab note embeds, fetched with the token (the browser has no GitLab login).
  app.openapi(route({
    method: 'get', path: '/api/gitlab-image', tags: ['Reviews'], operationId: 'getGitlabImage',
    summary: 'An image uploaded to a GitLab note', request: { query: z.object({ src: z.string().default('') }) },
    responses: { 200: { description: 'The image.', content: { 'image/*': { schema: z.string().openapi({ format: 'binary' }) } } } }, errors: [400, 404, 502],
  }), async (c) => {
    const { src } = c.req.valid('query');
    /** @type {any} */
    let project = null;
    try {
      project = projectOfUpload(new URL(src, GITLAB_BASE_URL).pathname, PROJECTS);
    } catch { /* not a URL: uploadFetchPath refuses it below */ }
    const path = project && uploadFetchPath(src, GITLAB_BASE_URL, project.encodedId);
    if (!path) return c.json({ error: 'not a GitLab upload' }, 400);
    try {
      const upstream = await fetch(`${GITLAB_BASE_URL}${path}`, { headers: { 'PRIVATE-TOKEN': GITLAB_TOKEN }, redirect: 'follow' });
      const type = upstream.headers.get('content-type') ?? '';
      if (!upstream.ok || !/^image\/(png|jpe?g|gif|webp|avif|bmp)/i.test(type)) return c.json({ error: 'image unavailable' }, 404);
      return c.body(await upstream.arrayBuffer(), 200, { 'content-type': type, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' });
    } catch {
      return c.json({ error: 'image unavailable' }, 502);
    }
  });
}
