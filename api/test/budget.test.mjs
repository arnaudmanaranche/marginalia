import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetOf, heldReason } from '../dist/src/budget.js';

// Noon, local time: the day started at local midnight, whatever the machine's zone.
const noon = new Date(2026, 10, 6, 12, 0, 0).getTime();
const at = (h, m = 0, day = 6) => new Date(2026, 10, day, h, m).toISOString();
const run = (over) => ({ at: at(9), project: 'p', iid: 1, kind: 'review', costUsd: 1, ...over });

test('counts only today, from local midnight, and resets at the next one', () => {
  const b = budgetOf({ runs: [run({ at: at(23, 59, 5), costUsd: 50 }), run({ at: at(0, 0) }), run({ costUsd: 2.345 })], limitUsd: 25, now: noon });
  assert.equal(b.spentUsd, 3.35);
  assert.equal(b.runs, 2);
  assert.equal(b.leftUsd, 21.65);
  assert.equal(b.over, false);
  assert.equal(b.since, at(0, 0));
  assert.equal(b.resetsAt, at(0, 0, 7));
});

test('is over once the spend reaches the limit, and never below zero left', () => {
  assert.equal(budgetOf({ runs: [run({ costUsd: 25 })], limitUsd: 25, now: noon }).over, true);
  const b = budgetOf({ runs: [run({ costUsd: 30 })], limitUsd: 25, now: noon });
  assert.equal(b.leftUsd, 0);
  assert.match(heldReason(b), /\$30\.00 of \$25\.00/);
});

test('no limit (null or 0) is never over', () => {
  for (const limitUsd of [null, 0]) {
    const b = budgetOf({ runs: [run({ costUsd: 900 })], limitUsd, now: noon });
    assert.equal(b.over, false);
    assert.equal(b.limitUsd, null);
    assert.equal(b.leftUsd, null);
  }
});

test('says where the money went: by kind and by MR, most expensive first', () => {
  const b = budgetOf({ runs: [
    run({ iid: 1, costUsd: 1 }), run({ iid: 2, costUsd: 4 }), run({ iid: 1, kind: 'triage', costUsd: 0.5 }),
    run({ iid: 1, project: 'q', costUsd: 2 }), run({ iid: null, kind: 'understand', costUsd: 3 }),
  ], limitUsd: 25, now: noon });
  assert.deepEqual(b.byKind, [{ kind: 'review', usd: 7, runs: 3 }, { kind: 'understand', usd: 3, runs: 1 }, { kind: 'triage', usd: 0.5, runs: 1 }]);
  assert.deepEqual(b.byMr, [
    { project: 'p', iid: 2, usd: 4, runs: 1 }, { project: 'q', iid: 1, usd: 2, runs: 1 }, { project: 'p', iid: 1, usd: 1.5, runs: 2 },
  ]);
});
