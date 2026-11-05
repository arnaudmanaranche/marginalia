---
name: critical-path-impact
description: Use when the review was given a project context with critical paths: find which ones the change touches, directly or through what it calls, and what proof they still work.
---

# Critical path impact

The project context lists the flows that cost the most when they break, with where they live. A
diff rarely says it touches one; find out.

1. **Map the diff to the paths.** For each critical path, compare its locations with the changed
   files. Then follow one level out: a changed shared helper, state, client, schema, config or
   dependency used by a path's code touches that path too. Search for the callers rather than
   guess.
2. **Name what is touched.** List each touched path by its exact name in `criticalPaths`. A path
   reached only through a rename, a formatting change or a test is not touched.
3. **Weigh it.** A touched path raises the risk: at least medium, high when a listed fragile spot is
   in the diff or the path's tests did not change while its behavior did. Say which path in the
   risk factors.
4. **Ask for proof.** When behavior on a touched path changes, the MR should show it still works:
   a test that covers the changed branch, or a before/after. Missing proof is an `important`
   finding on the main changed file, with a comment that names the path and the scenario to check.
5. **Stay quiet otherwise.** No path touched, `criticalPaths: []`, and nothing more is said about it.

Use the context's domain words in titles and comments. Where the context and the code disagree,
the code wins: say so in an `info` finding, so the context can be corrected.
