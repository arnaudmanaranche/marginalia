import { TRIAGE_FILE_PREFIX } from '../paths.ts';

export function kindOf(slug) {
  return slug.startsWith(TRIAGE_FILE_PREFIX) ? 'comments' : 'review';
}
