import type { BotStatus } from './api';

// `held`: its automatic review waits for tomorrow's budget (GLOSSARY: Budget).
export type BotState = 'pending' | 'reviewing' | 'failed' | 'skipped' | 'held' | 'up_to_date' | undefined;

// What the bot is doing with each review, by slug, from its status (`mr.reviewPath` names the review file).
export function botBySlug(mrs: BotStatus['mrs']): Map<string, BotState> {
  const byslug = new Map<string, BotState>();
  for (const mr of mrs ?? []) {
    const file = mr.reviewPath?.split('/').pop();
    if (file) byslug.set(`${mr.project}/${file.replace(/\.md$/, '')}`, mr.held === 'budget' ? 'held' : mr.status as BotState);
  }
  return byslug;
}
