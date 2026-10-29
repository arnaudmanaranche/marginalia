// @ts-check
import { TRIAGE_FILE_PREFIX } from '../paths.mjs';

export function kindOf(slug) {
  return slug.startsWith(TRIAGE_FILE_PREFIX) ? 'comments' : 'review';
}
