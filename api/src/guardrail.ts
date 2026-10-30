import { AgentReview, AgentTriage } from '@worldia/marginalia-contract';

// The gate between a run and everything that shows or posts its result: the findings file must
// satisfy the contract (packages/contract, agent-result.ts), whatever the agent did to get there.
// A result that fails throws, so the run ends failed and nothing of it is stored.
export const CONTRACT_BROKEN = 'The result broke the contract';

/** @param {'review' | 'triage'} kind @param {string | null} findingsRaw the content of the findings file */
export function enforceContract(kind: 'review' | 'triage', findingsRaw: string | null): void {
  if (findingsRaw === null) throw new Error(`${CONTRACT_BROKEN}: no findings file was written.`);
  let data: unknown;
  try {
    data = JSON.parse(findingsRaw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1'));
  } catch {
    throw new Error(`${CONTRACT_BROKEN}: the findings file is not valid JSON.`);
  }
  const parsed = (kind === 'review' ? AgentReview : AgentTriage).safeParse(data);
  if (parsed.success) return;
  const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'file'}: ${i.message}`);
  throw new Error(`${CONTRACT_BROKEN}: ${issues.join('; ')}.`);
}
