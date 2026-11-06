import { budgetOf } from './budget.ts';
import { runsSince } from './db-store.ts';
import { loadSettings } from './settings.ts';
import { getDb } from './store.ts';

// Today's budget, from the run table and the studio's setting (budget.ts holds the rules).
// Read fresh on every call: a run that just ended counts at once.
export function todayBudget(now = Date.now()) {
  const since = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  return budgetOf({ runs: runsSince(getDb(), since), limitUsd: loadSettings().dailyBudgetUsd, now });
}
