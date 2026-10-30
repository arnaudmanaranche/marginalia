import assert from 'node:assert/strict';
import { total } from './pricing.mjs';
assert.equal(total([100, 50], 10), 135);
