import { OWN_FILE_PREFIX, TRIAGE_FILE_PREFIX } from '../paths.ts';

export function kindOf(slug: string) {
  if (slug.startsWith(TRIAGE_FILE_PREFIX)) return 'comments';
  return slug.startsWith(OWN_FILE_PREFIX) ? 'own' : 'review';
}
