import { useContext } from 'react';
import { RecapMarksContext } from '../lib/reviewContexts';
import { Badge } from './ui/Badge';

// The recap's badge for one finding, if it has one: new, reworded, or where my comment on it stands.
export function RecapMark({ id }: { id: string }) {
  const mark = useContext(RecapMarksContext).get(id);
  return mark ? <Badge tone={mark.tone} title={mark.title}>{mark.label}</Badge> : null;
}
