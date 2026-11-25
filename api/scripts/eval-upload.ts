// `npm run eval -- --upload`: one PostHog Offline Evaluations experiment per eval run (ADR 0014), so a
// stage method version is compared with another on the same cases before its label moves. Each case is
// an item, each scorer of eval-score.ts a boolean result; a scorer that does not apply is not_applicable.
// Needs POSTHOG_EVAL_KEY (a personal API key, phx_..., scoped to the project: the scorer endpoints refuse a
// project secret key; with offline_evaluation_ingestion:write and
// llm_analytics:read and write), POSTHOG_PROJECT_ID and the app host (POSTHOG_APP_HOST, or POSTHOG_HOST
// without its `.i.`). The SDK is a dev dependency, loaded only here.
import type { Score } from './eval-score.ts';

export interface CaseResult { name: string; about: string; scores: Score[]; findings: any[]; methods: Record<string, number | null> | null }

const SUITE = 'marginalia-review';
const scorerName = (scorer: string) => `marginalia.${scorer}`;

// The methods of the run, as one string PostHog can group experiments by: "review-chapter@4,review-map@built-in".
export const promptVersionOf = (methods: Record<string, number | null> | null) => (methods
  ? Object.entries(methods).sort(([a], [b]) => a.localeCompare(b)).map(([name, v]) => `${name}@${v ?? 'built-in'}`).join(',')
  : 'unknown');

export function evalUploadConfig(env: Record<string, string | undefined>) {
  const host = env.POSTHOG_APP_HOST || env.POSTHOG_HOST?.replace(/\/\/(\w+)\.i\.posthog\.com/, '//$1.posthog.com');
  const missing = [!env.POSTHOG_EVAL_KEY && 'POSTHOG_EVAL_KEY', !Number(env.POSTHOG_PROJECT_ID) && 'POSTHOG_PROJECT_ID', !host && 'POSTHOG_APP_HOST or POSTHOG_HOST'].filter(Boolean);
  return missing.length ? { problem: `--upload needs ${missing.join(', ')}` } : { secretKey: env.POSTHOG_EVAL_KEY!, projectId: Number(env.POSTHOG_PROJECT_ID), host: host!.replace(/\/+$/, '') };
}

// The scorer's current version, created the first time it is used.
async function scorerVersion(client: any, scorer: string): Promise<string> {
  const name = scorerName(scorer);
  const page = await client.scorers.list({ search: name, kind: 'boolean', limit: 50 });
  const found = page.results.find((s: any) => s.name === name && !s.archived);
  if (found) return found.currentVersionId;
  const made = await client.scorers.create({ name, kind: 'boolean', config: { trueLabel: 'pass', falseLabel: 'fail' }, description: `Marginalia eval scorer ${scorer} (api/scripts/eval-score.ts)`, tags: ['marginalia'] });
  return made.currentVersionId;
}

export async function uploadEval(cases: CaseResult[], { version, env = process.env }: { version: string; env?: Record<string, string | undefined> }) {
  const config = evalUploadConfig(env);
  if ('problem' in config) throw new Error(config.problem);
  const { OfflineEvaluations, EvaluationItem, EvaluationResult } = await import('@posthog/ai/evaluations');
  const client = new OfflineEvaluations(config);
  try {
    const scorers = [...new Set(cases.flatMap((c) => c.scores.map((s) => s.scorer)))];
    const versions = Object.fromEntries(await Promise.all(scorers.map(async (s) => [s, await scorerVersion(client, s)])));
    const methods = cases.find((c) => c.methods)?.methods ?? null;
    const promptVersion = promptVersionOf(methods);
    const experiment = await client.createExperiment({
      name: `Marginalia eval ${new Date().toISOString().slice(0, 16)} (${promptVersion})`, runSource: 'local', suiteKey: SUITE,
      applicationVersion: version, promptVersion, expectedItemCount: cases.length, expectedResultCount: cases.reduce((n, c) => n + c.scores.length, 0),
    });
    try {
      const results = cases.flatMap((c) => {
        const item = new EvaluationItem({ caseKey: c.name, input: { case: c.name, about: c.about }, output: { findings: c.findings.map((f) => ({ severity: f.severity, title: f.title, path: f.path ?? null, line: f.line ?? null })) }, metadata: { methods: c.methods } });
        return c.scores.map((s) => (s.pass === null
          ? { item, scorerVersionId: versions[s.scorer], status: 'not_applicable' as const, reasoning: s.why }
          : { item, scorerVersionId: versions[s.scorer], value: s.pass, reasoning: s.why }));
      });
      await experiment.uploadResults(results.map((r) => new EvaluationResult(r as any)));
      await experiment.complete();
      return { experimentId: experiment.id, promptVersion };
    } catch (err) {
      await experiment.fail().catch(() => null);
      throw err;
    }
  } finally {
    client.close();
  }
}
