import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewerStateFor } from '../dist/src/review-actions.js';

test('only requesting changes sets a reviewer state on publish', () => {
  assert.equal(reviewerStateFor('request_changes'), 'requested_changes');
  assert.equal(reviewerStateFor('approve'), undefined);
  assert.equal(reviewerStateFor('comment'), undefined);
});
