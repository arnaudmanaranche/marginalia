// The briefing at the top of Home (GLOSSARY: Briefing, ADR 0012): a greeting, one sentence on what
// changed since the person last looked, and the few notes worth acting on. Pure: the clock comes in
// as `now`; nothing is said that the data does not show.
import type { Job, ReviewItem } from './api';
import { groupOf } from './dashboard';
import { ACTIVITY_ROUTE, QUEUE_ROUTE, contextRoute } from './hashRoute';
import { median } from './queue';

export interface Note { id: string; tone: 'fail' | 'warn' | 'run'; text: string; route: string | null; action: string }

export interface BriefingInput {
  now: number;
  // When this browser last left Home; null on a first visit, which counts the last day.
  since: number | null;
  items: ReviewItem[];
  jobs: Job[];
  budget: { spentUsd: number; limitUsd: number | null; over: boolean } | null;
  waiting: number;
  contexts: { project: string; approvedAt: string | null; draftLearnedAt: string | null }[];
  projects: string[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Past this many waiting tasks the line is falling behind (the queue's own threshold).
const BACKLOG = 5;
const NOTES = 4;

const t = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const money = (usd: number) => `$${usd.toFixed(2)}`;

export function greetingOf(now: number, name: string | null): string {
  const h = new Date(now).getHours();
  const part = h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name.split(' ')[0]}` : part;
}

// How long ago, in words a teammate would use.
export function agoWords(ms: number): string {
  if (ms < 10 * 60_000) return 'a few minutes ago';
  if (ms < HOUR) return `${Math.round(ms / 60_000)} minutes ago`;
  if (ms < DAY) return plural(Math.round(ms / HOUR), 'hour') + ' ago';
  return ms < 2 * DAY ? 'yesterday' : `${Math.floor(ms / DAY)} days ago`;
}

const joinWords = (parts: string[]) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);

// One sentence: what the bot did and what came back to the person since they last looked.
export function sinceSentence({ now, since, items, jobs }: BriefingInput): string {
  const from = since ?? now - DAY;
  const lead = since === null ? 'In the last day' : `Since you last looked, ${agoWords(now - since)}`;
  const inWindow = (iso: string | null | undefined) => t(iso) > from;
  const reviewed = new Set(jobs.filter((j) => j.outcome === 'reviewed' && j.kind === 'review' && inWindow(j.endedAt)).map((j) => j.slug)).size;
  const asks = items.filter((i) => i.kind === 'review' && i.verdict === 'REQUEST_CHANGES' && inWindow(i.reviewedAt)).length;
  const comments = items.filter((i) => i.kind === 'comments' && inWindow(i.myState?.peerActivityAt)).length;
  const back = items.filter((i) => groupOf(i) === 'returned' && (inWindow(i.myState?.lastPushAt) || inWindow(i.myState?.authorActivityAt))).length;
  const failed = jobs.filter((j) => j.outcome === 'failed' && !j.failure?.transient && inWindow(j.endedAt)).length;
  const parts = [
    reviewed > 0 && `the bot reviewed ${plural(reviewed, 'MR')}${asks > 0 ? ` (${asks} ${asks === 1 ? 'asks' : 'ask'} for changes)` : ''}`,
    back > 0 && `${plural(back, 'MR')} came back to you`,
    comments > 0 && `people commented on ${comments === 1 ? 'one of your MRs' : `${comments} of your MRs`}`,
    failed > 0 && `${plural(failed, 'run')} failed`,
  ].filter((p): p is string => Boolean(p));
  return parts.length ? `${lead}, ${joinWords(parts)}.` : `${lead}, nothing changed.`;
}

// What the days before today cost, from the jobs: a usual day is their median.
function usualDay(jobs: Job[], now: number): number | null {
  const today = new Date(now).toDateString();
  const byDay = new Map<string, number>();
  for (const j of jobs) {
    const day = new Date(t(j.startedAt)).toDateString();
    if (day !== today && now - t(j.startedAt) < 14 * DAY && j.cost) byDay.set(day, (byDay.get(day) ?? 0) + j.cost.usd);
  }
  return byDay.size >= 3 ? median([...byDay.values()]) : null;
}

// The notes worth acting on, most pressing first; none on a day with nothing to say.
export function notesOf(input: BriefingInput): Note[] {
  const { now, jobs, budget, waiting, contexts, projects } = input;
  const notes: Note[] = [];
  if (budget?.over) {
    notes.push({ id: 'budget', tone: 'fail', text: "Today's budget is reached: automatic reviews wait until midnight. A mention or Run again still runs.", route: QUEUE_ROUTE, action: 'See the queue' });
  } else if (budget) {
    const usual = usualDay(jobs, now);
    const left = budget.limitUsd === null ? null : budget.limitUsd - budget.spentUsd;
    if (left !== null && budget.limitUsd && left / budget.limitUsd <= 0.2) {
      notes.push({ id: 'budget', tone: 'warn', text: `${money(left)} left of today's budget: automatic reviews stop when it runs out.`, route: ACTIVITY_ROUTE, action: 'See what it went on' });
    } else if (usual && budget.spentUsd >= 2 && budget.spentUsd >= 1.5 * usual) {
      notes.push({ id: 'spend', tone: 'warn', text: `Today has cost ${money(budget.spentUsd)}, about ${(budget.spentUsd / usual).toFixed(1)}× a usual day (${money(usual)}).`, route: ACTIVITY_ROUTE, action: 'See what it went on' });
    }
  }
  // The same failure more than once among the latest runs, the last one within a day: a pattern, not bad luck.
  const recent = jobs.filter((j) => j.outcome !== 'running').slice(0, 20);
  const kinds = new Map<string, Job[]>();
  for (const j of recent) if (j.outcome === 'failed' && j.failure) kinds.set(j.failure.kind, [...(kinds.get(j.failure.kind) ?? []), j]);
  const repeat = [...kinds.values()].filter((js) => js.length >= 2 && now - t(js[0].endedAt ?? js[0].startedAt) < DAY).sort((a, b) => b.length - a.length)[0];
  if (repeat) notes.push({ id: 'repeat', tone: 'fail', text: `The same failure hit ${repeat.length} of the last ${recent.length} runs: ${repeat[0].failure!.title}.`, route: ACTIVITY_ROUTE, action: 'See the runs' });
  if (waiting > BACKLOG) notes.push({ id: 'backlog', tone: 'warn', text: `${waiting} tasks wait in the queue: the bot is falling behind.`, route: QUEUE_ROUTE, action: 'See the queue' });
  // A project with neither an approved context nor a draft: its reviews know nothing of its critical paths.
  for (const p of projects) {
    const c = contexts.find((x) => x.project === p);
    if (c && !c.approvedAt && !c.draftLearnedAt) notes.push({ id: `context:${p}`, tone: 'run', text: `${p} has no approved context yet: its reviews don't know its critical paths.`, route: contextRoute(p), action: 'Learn the project' });
  }
  return notes.slice(0, NOTES);
}
