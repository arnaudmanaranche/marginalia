import { createHash } from 'node:crypto';

// The analytics event for one Claude run, as a plain object: pure, so what leaves the machine is
// tested. Ids and numbers only: never an MR title, a branch name, a diff or any review text.
export const RUN_EVENT = 'marginalia_run';

// The same run always gets the same id, so a backfill and the live event of one run are one event
// to PostHog (it de-duplicates on uuid). A v5-shaped UUID from a hash of `seed`.
/** @param {string} seed */
export function eventUuid(seed) {
  const h = createHash('sha1').update(seed).digest('hex');
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

/** The seed of a run: where and when it ran, which MR, which kind of pass. */
export const runSeed = (run) => `run|${run.project ?? ''}|${run.iid ?? ''}|${run.kind}|${run.at}`;

const base = ({ reviewer, version, container }) => ({
  $process_person_profile: false, // events, not people: no person profile is created
  $lib: 'marginalia',
  reviewer,
  marginalia_version: version ?? null,
  in_container: Boolean(container),
});

/**
 * @param {{ run: { at: string, project?: string | null, iid?: number | string | null, kind: string, command?: string, costUsd?: number, outputTokens?: number, turns?: number, durationMs?: number | null },
 *   runNumber: number, reviewer: string, version?: string, container?: boolean,
 *   report?: { source?: string, verdict?: string | null, risk?: string | null, critical?: number, important?: number, postable?: number, warnings?: number } }} input
 */
export function runEvent({ run, runNumber, reviewer, version, container, report }) {
  return {
    event: RUN_EVENT,
    distinct_id: `marginalia:${reviewer}`,
    uuid: eventUuid(runSeed(run)),
    timestamp: run.at,
    properties: {
      ...base({ reviewer, version, container }),
      project: run.project ?? null,
      mr_iid: run.iid ?? null,
      kind: run.kind,
      command: run.command ?? null,
      outcome: report ? 'reported' : 'completed',
      cost_usd: Math.round((run.costUsd ?? 0) * 10_000) / 10_000,
      output_tokens: run.outputTokens ?? 0,
      turns: run.turns ?? 0,
      duration_ms: run.durationMs ?? null,
      run_number: runNumber,
      rerun: runNumber > 1, // this MR had a pass of this kind before
      ...(report && {
        report_source: report.source ?? null,
        verdict: report.verdict ?? null,
        risk: report.risk ?? null,
        critical: report.critical ?? 0,
        important: report.important ?? 0,
        postable: report.postable ?? 0,
        contract_warnings: report.warnings ?? 0,
      }),
    },
  };
}

// A short class of failure, from the message; the message itself (paths, output) never leaves.
/** @param {string} message */
export function errorKind(message) {
  if (/GitLab API/.test(message)) return 'gitlab';
  if (/timed? ?out|ETIMEDOUT|timeout/i.test(message)) return 'timeout';
  if (/refused|not allowed|permission|sandbox/i.test(message)) return 'permission';
  if (/did not produce a report|no report/i.test(message)) return 'no_report';
  if (/claude|exited with code/i.test(message)) return 'claude';
  if (/\bgit\b|worktree|not a git/i.test(message)) return 'git';
  return 'other';
}

/**
 * @param {{ project?: string | null, iid?: number | string | null, kind: string, command?: string, error: string, reviewer: string, at: string, version?: string, container?: boolean }} input
 */
export function failureEvent({ project, iid, kind, command, error, reviewer, at, version, container }) {
  return {
    event: RUN_EVENT,
    distinct_id: `marginalia:${reviewer}`,
    uuid: eventUuid(`failed|${project ?? ''}|${iid ?? ''}|${kind}|${at}`),
    timestamp: at,
    properties: { ...base({ reviewer, version, container }), project: project ?? null, mr_iid: iid ?? null, kind, command: command ?? null, outcome: 'failed', error_kind: errorKind(error) },
  };
}

// The events of past runs (rows of the `run` table, oldest first), numbering the passes of each MR
// in order, for a backfill. They carry no report details: those were not stored with the run.
/** @param {Parameters<typeof runEvent>[0]['run'][]} rows @param {{ reviewer: string, version?: string, container?: boolean }} context */
export function eventsFromRuns(rows, context) {
  const seen = new Map();
  return rows.map((run) => {
    const key = `${run.project ?? ''}|${run.iid ?? ''}|${run.kind}`;
    const runNumber = (seen.get(key) ?? 0) + 1;
    seen.set(key, runNumber);
    return runEvent({ run, runNumber, ...context });
  });
}
