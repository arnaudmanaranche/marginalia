import type { Recap } from './recapApi';
import { DISAGREEMENT, signalWords } from './recapText';
import { STANDING_WORDS } from './recapWords';
import type { BadgeTone } from '../components/ui/badgeStyles';

// The small badge a finding wears in the list once its MR has a recap: where my comment on it stands,
// or that it is new, or that it may be an earlier finding said differently. A finding that is simply still
// there wears nothing: the page stays quiet about what did not change.
export interface RecapMark {
  label: string;
  tone: BadgeTone;
  title: string;
}

export function marksOf(recap: Recap | null): Map<string, RecapMark> {
  const marks = new Map<string, RecapMark>();
  if (!recap) return marks;
  for (const c of recap.comments) {
    const words = STANDING_WORDS[c.standing];
    const rests = ['Your comment', ...signalWords(c)].join(' · ');
    marks.set(c.findingId, { label: words.label, tone: words.tone, title: c.disagreement ? `${rests}. ${DISAGREEMENT}.` : rests });
  }
  for (const f of recap.newFindings) {
    const where = f.onChangedCode === true ? ', on code changed since' : f.onChangedCode === false ? ', on older code the bot only raised now' : '';
    marks.set(f.id, { label: 'new', tone: 'info', title: `New${where}` });
  }
  for (const p of recap.reworded) marks.set(p.now.id, { label: 'reworded?', tone: 'neutral', title: `Probably an earlier finding: ${p.was.title}` });
  return marks;
}
