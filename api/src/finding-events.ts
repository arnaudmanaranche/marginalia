import { eventUuid } from './event-uuid.ts';

// The analytics event for what became of one finding: the review line's measure (ADR 0006,
// Finding outcome). Pure, so what leaves the machine is tested. Ids, kinds and counts only: never
// a title, a comment, a path or a branch name.
export const FINDING_EVENT = 'marginalia_finding';

type FindingOutcome = 'posted' | 'posted_edited' | 'dismissed' | 'fixed_before_mr';

// Posted as the review proposed it, or edited first. Whitespace around the text does not count.
export const postedOutcome = (proposed: string | null | undefined, sent: string): FindingOutcome => (proposed && proposed.trim() === sent.trim() ? 'posted' : 'posted_edited');

interface FindingEventInput {
  project: string; iid: number | string | null; scope?: string; findingId: string; severity: string | null;
  outcome: FindingOutcome; own: boolean; criticalPaths: number; reviewer: string; at: string; version?: string;
  // The stage methods of the review the finding came from, name to version (ADR 0014).
  methods?: Record<string, number | null> | null;
}

export function findingEvent({ project, iid, scope, findingId, severity, outcome, own, criticalPaths, reviewer, at, version, methods = null }: FindingEventInput) {
  return {
    event: FINDING_EVENT,
    distinct_id: `marginalia:${reviewer}`,
    // One outcome per finding of one review: a second post of the same finding is the same event.
    // `scope` names a review that has no MR number (an own branch): its slug.
    uuid: eventUuid(`finding|${project}|${scope ?? iid ?? ''}|${findingId}|${outcome}`),
    timestamp: at,
    properties: {
      $process_person_profile: false,
      $lib: 'marginalia',
      reviewer,
      marginalia_version: version ?? null,
      project,
      mr_iid: iid,
      finding_id: findingId,
      severity,
      outcome,
      acted_on: true,
      own_review: own,
      critical_paths: criticalPaths,
      // A finding is written by a chapter's reviewer: its outcome measures the review-chapter method.
      ...(methods && { prompt_name: 'review-chapter', prompt_version: methods['review-chapter'] ?? null, marginalia_prompts: methods }),
    },
  };
}
