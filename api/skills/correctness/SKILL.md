---
name: correctness
description: Use when checking that changed code does what it claims: logic errors, edge cases, error handling, concurrency, state and API misuse.
---

# Correctness

Read the callers and callees of what changed, not only the diff. For each behavioral change ask what input breaks it.

- **Boundaries.** Empty, zero, negative, very large, duplicate, unicode, timezone, locale, null or missing.
- **Errors.** A swallowed exception, an error path that leaves partial state, a retry that repeats a side effect, a failure that is reported as success.
- **State and order.** Concurrent callers, repeated calls, a changed order of operations, a cache or flag that outlives its reason.
- **Contracts.** A changed signature or return shape with a caller left behind; a library used against its documented behavior.
- **Off by one and units.** Indexes, ranges, inclusive and exclusive ends, seconds and milliseconds, cents and units.

Run the repo's tests, type check and linter on the changed code. Where a claim is cheap to test, write a throwaway check, run it, and never commit it. A suspicion you could not verify is a `suggestion` at most, and says it is unverified. Confirmed wrong behavior is `critical` or `important`.
