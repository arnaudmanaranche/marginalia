import { z } from '@hono/zod-openapi';
import { ContextSummaries, ProjectContextState } from '@worldia/marginalia-contract';
import { DATA_DIR, GITLAB_USERNAME } from '../config.ts';
import { approveDraft, readContext } from '../context-store.ts';
import { understandProject } from '../understand.ts';
import { logger } from '../logger.ts';
import { currentScope, visibleProjects } from './request-scope.ts';
import { broadcast } from './context.ts';
import { jsonOf, route } from './route-kit.ts';

// A project's learned context in the studio (ADR 0006): read it, approve the draft so reviews use
// it, or learn the project again. The person approving is the one signed in, or the bot's user locally.
const learning = new Set<string>();
const projectParam = { params: z.object({ key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/) }) };
const find = (key: string) => visibleProjects().find((p: any) => p.key === key) ?? null;
const stateOf = async (project: any) => ({
  project: project.key,
  draft: await readContext(DATA_DIR, project.key, 'draft'),
  approved: await readContext(DATA_DIR, project.key, 'approved'),
  learning: learning.has(project.key),
});

export function contextRoutes(app: any) {
  app.openapi(route({
    method: 'get', path: '/api/contexts', tags: ['Projects'], operationId: 'listContexts',
    summary: 'When each project\'s context was learned and approved', responses: { 200: jsonOf(ContextSummaries, 'Per project.') }, errors: [],
  }), async (c: any) => {
    const contexts = await Promise.all(visibleProjects().map(async (p: any) => {
      const s = await stateOf(p);
      return { project: p.key, draftLearnedAt: s.draft?.learnedAt ?? null, approvedAt: s.approved?.approvedAt ?? null };
    }));
    return c.json({ contexts }, 200);
  });

  app.openapi(route({
    method: 'get', path: '/api/projects/{key}/context', tags: ['Projects'], operationId: 'getContext',
    summary: 'The draft and approved context of one project', request: projectParam,
    responses: { 200: jsonOf(ProjectContextState, 'Both versions, either may be null.') }, errors: [400, 404],
  }), async (c: any) => {
    const project = find(c.req.valid('param').key);
    return project ? c.json(await stateOf(project), 200) : c.json({ error: 'no such project' }, 404);
  });

  app.openapi(route({
    method: 'post', path: '/api/projects/{key}/context/approve', tags: ['Projects'], operationId: 'approveContext',
    summary: 'Approve the draft: reviews use it from now on', request: projectParam,
    responses: { 200: jsonOf(ProjectContextState, 'The approved context.') }, errors: [400, 404, 409, 415],
  }), async (c: any) => {
    const project = find(c.req.valid('param').key);
    if (!project) return c.json({ error: 'no such project' }, 404);
    const approved = await approveDraft(DATA_DIR, project.key, currentScope()?.user.username ?? GITLAB_USERNAME);
    if (!approved) return c.json({ error: 'there is no draft to approve' }, 409);
    broadcast();
    return c.json(await stateOf(project), 200);
  });

  app.openapi(route({
    method: 'post', path: '/api/projects/{key}/understand', tags: ['Projects'], operationId: 'learnProject',
    summary: 'Learn the project again into a new draft', description: 'A task of the queue, ahead of the polls; it shows in the jobs.', request: projectParam,
    responses: { 200: jsonOf(ProjectContextState, 'Learning has started.') }, errors: [400, 404, 409, 415],
  }), async (c: any) => {
    const project = find(c.req.valid('param').key);
    if (!project) return c.json({ error: 'no such project' }, 404);
    if (learning.has(project.key)) return c.json({ error: 'this project is already being learned' }, 409);
    learning.add(project.key);
    void understandProject(project)
      .catch((err) => logger.warn({ err, project: project.key }, 'Learning the project failed'))
      .finally(() => { learning.delete(project.key); broadcast(); });
    broadcast();
    return c.json(await stateOf(project), 200);
  });
}
