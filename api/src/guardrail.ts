import { AgentProjectContext, AgentReview, AgentTriage } from '@worldia/marginalia-contract';
import { repairReview } from './findings-repair.ts';
import { logger } from './logger.ts';

// The gate between a run and everything that shows or posts its result: the findings file must
// satisfy the contract (packages/contract, agent-result.ts), whatever the agent did to get there.
// A result that fails throws, so the run ends failed and nothing of it is stored. An Understand
// job's project context goes through the same gate.
export const CONTRACT_BROKEN = 'The result broke the contract';

const SCHEMA = { review: AgentReview, triage: AgentTriage, context: AgentProjectContext };

/** @param findingsRaw the content of the findings file (or the context file) */
export function enforceContract(kind: keyof typeof SCHEMA, findingsRaw: string | null): unknown {
  if (findingsRaw === null) throw new Error(`${CONTRACT_BROKEN}: no findings file was written.`);
  let data: unknown;
  try {
    data = JSON.parse(findingsRaw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1'));
  } catch {
    throw new Error(`${CONTRACT_BROKEN}: the findings file is not valid JSON.`);
  }
  const { data: repaired, repairs } = kind === 'review' ? repairReview(data) : { data, repairs: [] };
  if (repairs.length) logger.warn({ repairs }, 'The review was repaired before the contract check');
  const parsed = SCHEMA[kind].safeParse(repaired);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'file'}: ${i.message}`);
  throw new Error(`${CONTRACT_BROKEN}: ${issues.join('; ')}.`);
}
