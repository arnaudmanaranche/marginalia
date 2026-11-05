import { Approvals, DismissRequest, Ok } from '@worldia/marginalia-contract';
import { ALLOW_POSTING, GITLAB_USERNAME } from '../config.ts';
import { listProposals } from '../approvals.ts';
import { dismissFinding, dismissedKeys, restoreFinding } from '../dismissed-store.ts';
import { posted } from '../posted.ts';
import { getDb } from '../store.ts';
import { trackFinding } from '../telemetry.ts';
import { currentScope, visibleProjects } from './request-scope.ts';
import { broadcast, locate, readStatus } from './context.ts';
import { jsonBody, jsonOf, route } from './route-kit.ts';

// The approvals inbox: every comment proposed and not decided yet, and the way to say no to one.
// Saying yes is adding it to the pending review (POST /api/post), as on the review page.
export function approvalRoutes(app: any) {
  app.openapi(route({
    method: 'get', path: '/api/approvals', tags: ['Pending review'], operationId: 'listApprovals',
    summary: 'Comments proposed and not decided yet', description: 'Neither added to a review nor dismissed, newest review first.',
    responses: { 200: jsonOf(Approvals, 'The proposals.') }, errors: [],
  }), async (c: any) => {
    const status = await readStatus();
    const proposals = await listProposals({ projects: visibleProjects(), mrs: status?.mrs ?? [], posted: posted.all(), dismissed: dismissedKeys(getDb()) });
    return c.json({ proposals, canPost: Boolean(currentScope()) || ALLOW_POSTING === 'true' }, 200);
  });

  app.openapi(route({
    method: 'post', path: '/api/dismiss', tags: ['Pending review'], operationId: 'dismissFinding',
    summary: 'Decide not to say a proposed comment', description: 'Nothing is sent to GitLab. `undo` brings it back.',
    request: { body: jsonBody(DismissRequest) }, responses: { 200: jsonOf(Ok, 'Recorded.') }, errors: [400, 404, 409, 415],
  }), async (c: any) => {
    const { slug, commentId, undo } = c.req.valid('json');
    const found = await locate(slug);
    if (!found?.mr) return c.json({ error: 'no tracked merge request for this review' }, 404);
    const { project, mr } = found;
    if (posted.find(project.key, found.slug, commentId)) return c.json({ error: 'already added to the review' }, 409);
    if (undo) restoreFinding(getDb(), project.key, found.slug, commentId);
    else {
      dismissFinding(getDb(), project.key, found.slug, commentId, currentScope()?.user.username ?? GITLAB_USERNAME);
      trackFinding({ project: project.key, iid: mr.iid, findingId: commentId, severity: null, outcome: 'dismissed', own: false, criticalPaths: 0 });
    }
    broadcast();
    return c.json({ ok: true }, 200);
  });
}
