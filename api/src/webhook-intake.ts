import { botQueue } from './bot-queue.ts';
import { gitlab } from './gitlab-api.ts';
import { logger } from './logger.ts';
import { intakeNote } from './mention-pass.ts';
import { failureTitleOf, mentionDeps } from './mention-deps.ts';
import { PROJECTS } from './projects.ts';
import { startWebhook } from './webhook-server.ts';
import { projectOfEvent, type NoteEvent } from './webhook.ts';

// The webhook intake, wired: a note on an open MR of a watched project becomes a task of the queue,
// ahead of the polls, and goes through the same guardrails as a polled one. The same note twice
// while it waits is one task.
export const handleNoteEvent = async (ev: NoteEvent) => {
  const project: any = projectOfEvent(PROJECTS, ev);
  if (!project) return logger.warn({ path: ev.projectPath }, 'Webhook for a project that is not watched');
  return botQueue.enqueue({
    kind: 'mention', label: `Answer a mention on !${ev.iid}`, project: project.key, priority: 'high',
    payload: { project: project.key, iid: ev.iid, noteId: ev.noteId }, dedupe: `mention:${project.key}:${ev.noteId}`,
  });
};

botQueue.handle('mention', async ({ project: key, iid, noteId }) => {
  const project = PROJECTS.find((p: any) => p.key === key);
  if (!project) throw new Error(`No project "${key}" any more`);
  const mr = await gitlab.getMergeRequest(project, iid);
  if (mr.state !== 'opened') return;
  await intakeNote(project, { ...mr, project }, noteId, mentionDeps, failureTitleOf);
});

// Started only with a secret: without one the listener does not exist (polling stays the intake).
export function startWebhookIfConfigured(env = process.env) {
  const secret = env.WEBHOOK_SECRET;
  if (!secret) return null;
  return startWebhook({ secret, port: Number(env.WEBHOOK_PORT) || 4478, host: env.WEBHOOK_HOST || '127.0.0.1', onNote: handleNoteEvent });
}
