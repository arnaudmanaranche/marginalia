import { gitlab } from './gitlab-api.ts';
import { logger } from './logger.ts';
import { intakeNote } from './mention-pass.ts';
import { failureTitleOf, mentionDeps } from './mention-deps.ts';
import { PROJECTS } from './projects.ts';
import { serial } from './serial.ts';
import { startWebhook } from './webhook-server.ts';
import { projectOfEvent, type NoteEvent } from './webhook.ts';

// The webhook intake, wired: a note on an open MR of a watched project goes through the same
// guardrails as a polled one, one run at a time with the polls (serial.ts).
export const handleNoteEvent = (ev: NoteEvent) => serial.run(async () => {
  const project = projectOfEvent(PROJECTS, ev);
  if (!project) return logger.warn({ path: ev.projectPath }, 'Webhook for a project that is not watched');
  const mr = await gitlab.getMergeRequest(project, ev.iid);
  if (mr.state !== 'opened') return;
  await intakeNote(project, { ...mr, project }, ev.noteId, mentionDeps, failureTitleOf);
});

// Started only with a secret: without one the listener does not exist (polling stays the intake).
export function startWebhookIfConfigured(env = process.env) {
  const secret = env.WEBHOOK_SECRET;
  if (!secret) return null;
  return startWebhook({ secret, port: Number(env.WEBHOOK_PORT) || 4478, host: env.WEBHOOK_HOST || '127.0.0.1', onNote: handleNoteEvent });
}
