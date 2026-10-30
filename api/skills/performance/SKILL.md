---
name: performance
description: Use when a change adds queries, loops over data, network calls, rendering work or caching, where the cost grows with input or traffic.
---

# Performance

Look for cost that grows with data or traffic, on a path that is actually hot. Say which input size makes it matter; without that, it is not a finding.

- **Queries and calls.** One call per item in a loop (N+1), a missing index for a new filter or sort, an unbounded `SELECT`, a request made serially that could be batched or run together.
- **Work per request.** Computation, parsing or serialization repeated where it could be done once, a large payload where a few fields would do, work done before a cheap early return.
- **Memory.** Loading a whole file or table to process it item by item, a cache with no bound or expiry, a listener or timer never released.
- **Rendering.** Re-render or re-layout on every change, a large list with no windowing, an expensive effect with a wrong dependency list.
- **Measurement.** A claim of "faster" without a number, and an optimization that makes the code harder to read for no measured gain.

Do not ask for micro-optimizations. A cost that will hurt at today's size is `important`; a growth risk is a `suggestion` with the size at which it bites.
