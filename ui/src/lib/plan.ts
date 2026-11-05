import type { RunStage, RunStep } from './api';

// A run as a plan: each stage with the steps taken in it, the tools they called (each once, in the
// order first used) and what it did last. Pure.
export interface PlanRow { stage: RunStage; steps: RunStep[]; tools: string[]; latest: string | null }

export function planRows(stages: RunStage[], steps: RunStep[] = []): PlanRow[] {
  return stages.map((stage) => {
    const mine = steps.filter((s) => s.stage === stage.id);
    const tools = [...new Set(mine.map((s) => s.tool).filter((t): t is string => Boolean(t)))];
    return { stage, steps: mine, tools, latest: mine.length ? mine[mine.length - 1].text : null };
  });
}

// Where the run stands: the stage it is on (or stopped at), counted from one, and how many there are.
export function position(stages: RunStage[]) {
  const at = stages.findIndex((s) => s.state === 'running' || s.state === 'failed');
  const done = stages.filter((s) => s.state === 'done').length;
  return { current: at === -1 ? Math.min(done, stages.length) : at + 1, total: stages.length };
}
