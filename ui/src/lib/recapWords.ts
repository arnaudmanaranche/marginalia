import type { RecapCounts, Standing } from './recapApi';
import type { BadgeTone } from '../components/ui/badgeStyles';

// The words of a recap, said once: the panel, the finding list and the MR row all read these, so
// "3 addressed" is never "3 fixed" somewhere else (GLOSSARY: Standing).
export const STANDING_WORDS: Record<Standing, { label: string; tone: BadgeTone }> = {
  addressed: { label: 'addressed', tone: 'success' },
  contested: { label: 'contested', tone: 'warning' },
  untouched: { label: 'untouched', tone: 'neutral' },
  dropped: { label: 'dropped', tone: 'neutral' },
};

export interface RecapPart {
  key: 'addressed' | 'contested' | 'untouched' | 'new' | 'reworded';
  label: string;
  count: number;
  tone: BadgeTone;
}

// What the one-line summary says, in the order that matters: how my comments fared, then what is new.
// Nothing at zero is said; what I dropped and what the bot stopped raising are not news.
export function recapParts(counts: RecapCounts): RecapPart[] {
  const parts: RecapPart[] = [
    { key: 'addressed', label: STANDING_WORDS.addressed.label, count: counts.addressed, tone: STANDING_WORDS.addressed.tone },
    { key: 'contested', label: STANDING_WORDS.contested.label, count: counts.contested, tone: STANDING_WORDS.contested.tone },
    { key: 'untouched', label: STANDING_WORDS.untouched.label, count: counts.untouched, tone: STANDING_WORDS.untouched.tone },
    { key: 'new', label: 'new', count: counts.newFindings, tone: 'info' },
    { key: 'reworded', label: 'reworded?', count: counts.reworded, tone: 'neutral' },
  ];
  return parts.filter((p) => p.count > 0);
}

// "3 addressed · 1 contested · 2 new", or '' when there is nothing to say.
export const recapLine = (counts: RecapCounts) => recapParts(counts).map((p) => `${p.count} ${p.label}`).join(' · ');
