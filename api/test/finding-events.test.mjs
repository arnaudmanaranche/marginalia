import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINDING_EVENT, findingEvent, postedOutcome } from '../dist/src/finding-events.js';
import { runEvent } from '../dist/src/run-events.js';

const input = { project: 'webapp', iid: 4004, findingId: 'neg-total', severity: 'important', outcome: 'posted', own: false, criticalPaths: 1, reviewer: 'me', at: '2026-11-05T12:00:00Z' };

test('a finding posted as proposed, or edited first, whitespace aside', () => {
  assert.equal(postedOutcome('Please rename this.', ' Please rename this.\n'), 'posted');
  assert.equal(postedOutcome('Please rename this.', 'Please rename this, it clashes.'), 'posted_edited');
  assert.equal(postedOutcome(null, 'Written by hand.'), 'posted_edited');
});

test('the finding event carries ids and counts, never text, and is the same event when sent twice', () => {
  const e = findingEvent(input);
  assert.equal(e.event, FINDING_EVENT);
  assert.deepEqual(
    Object.keys(e.properties).sort(),
    ['$lib', '$process_person_profile', 'acted_on', 'critical_paths', 'finding_id', 'marginalia_version', 'mr_iid', 'outcome', 'own_review', 'project', 'reviewer', 'severity'].sort(),
  );
  assert.equal(e.uuid, findingEvent({ ...input, at: '2026-11-06T00:00:00Z' }).uuid);
  assert.notEqual(e.uuid, findingEvent({ ...input, outcome: 'posted_edited' }).uuid);
});

test('a run event says whether it was an own review and how many critical paths it touched', () => {
  const e = runEvent({ run: { at: 'x', kind: 'review' }, runNumber: 1, reviewer: 'me', report: { own: true, criticalPaths: 2 } });
  assert.equal(e.properties.own_review, true);
  assert.equal(e.properties.critical_paths, 2);
});
