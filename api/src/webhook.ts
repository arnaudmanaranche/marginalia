import { createHash, timingSafeEqual } from 'node:crypto';

// What GitLab's webhook says, read pure. Only a Note Hook on a merge request matters here.
// The token is compared before the body is read, in constant time (digests have equal length).
export function tokenMatches(header: string | null | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(header), digest(secret));
}

export interface NoteEvent { projectId: number; projectPath: string; iid: number; noteId: number }

export function parseNoteHook(payload: any): NoteEvent | null {
  const a = payload?.object_attributes;
  if (payload?.object_kind !== 'note' || a?.noteable_type !== 'MergeRequest' || a.system) return null;
  const iid = payload.merge_request?.iid;
  if (!Number.isInteger(a.id) || !Number.isInteger(iid) || typeof payload.project?.path_with_namespace !== 'string') return null;
  return { projectId: Number(payload.project.id), projectPath: payload.project.path_with_namespace, iid, noteId: a.id };
}

// The watched project the event is about: by path, or by id when the project was configured by number.
export const projectOfEvent = <P extends { encodedId: string }>(projects: P[], ev: NoteEvent): P | null =>
  projects.find((p) => decodeURIComponent(p.encodedId) === ev.projectPath || p.encodedId === String(ev.projectId)) ?? null;
