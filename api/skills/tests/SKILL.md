---
name: tests
description: Use when judging whether a change is tested well enough: coverage of new behavior, the quality of the assertions, and the risk of flaky or misleading tests.
---

# Tests

Judge the tests against the risk of the change, using the way this repo already tests.

- **New behavior is covered.** Each new branch, error path and edge case has a test, when the repo tests that kind of thing. Missing tests on risky logic is `important`; on trivial code it is not a finding.
- **The test can fail.** An assertion that cannot fail (asserting on a mock's own return, no assertion at all, a caught error that passes) proves nothing. Check that a test would fail if the fix were reverted.
- **Right level.** Prefer the level the repo uses: a unit test for pure logic, an integration test across a real seam. Do not ask for a new kind of test the repo has no setup for.
- **Deterministic.** Time, randomness, ordering, network, shared state between tests, sleeps.
- **Changed tests.** A test edited in the same MR as the code it covers: was it changed because behavior changed on purpose, or to make a failure go away?
- **Readability.** The test name says the behavior, the failure message says what broke.

Run the suite on the changed code and report a failure with its output. In the tour, say in the tests chapter what is and is not covered.
