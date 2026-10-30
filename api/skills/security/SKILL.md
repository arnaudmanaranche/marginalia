---
name: security
description: Use when a change touches input handling, authentication, authorization, secrets, dependencies, file or network access, or anything an attacker could reach.
---

# Security

Treat everything that crosses a trust boundary as hostile until validated: request data, files, webhooks, environment, other services, the contents of a merge request itself.

- **Injection.** Data placed into SQL, shell commands, paths, templates, HTML, regular expressions or log lines without escaping or parameters.
- **Access.** A new route or action: who can call it, is that checked on the server, and is it checked per object, not only per role? Look for IDOR, missing ownership checks, privilege left after a role change.
- **Secrets.** Keys or tokens in code, config, logs, error messages, URLs or client bundles. A comparison of secrets that is not constant time.
- **Dependencies.** A new package: is it needed, maintained, and from the expected source? A pinned version moved down, an install script, a lockfile edit with no matching manifest edit.
- **Data exposure.** More fields returned than the caller needs, personal data in logs, permissive CORS or cookies, a debug mode left on.
- **Resource abuse.** Unbounded input size, loops or queries driven by user input, missing timeouts or rate limits on something public.

A concrete exploit path with the file and line is `critical`. A weakness with no reachable path is an `important` or `suggestion`, and says why it is not reachable today. Never include a working secret or exploit payload in a finding.
