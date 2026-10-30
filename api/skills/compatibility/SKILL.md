---
name: compatibility
description: Use when a change alters something others depend on: a public API, a schema, a config or environment variable, a file format, a CLI, or supported runtime versions.
---

# Compatibility

Find what outside code or data depends on the changed thing, and what happens to it.

- **Public surfaces.** An HTTP route, event, exported function, CLI flag, config key or environment variable renamed, removed, or made stricter. Search the repo and the docs for its users.
- **Stored data.** A schema, file format or enum change: does the old data still load, is there a migration, can the deploy roll back without losing writes?
- **Versions.** Syntax or APIs newer than the runtimes, browsers or dependencies the repo supports. A dependency range that now excludes a supported version.
- **Order of deploy.** Two services or a client and a server that must change together: what breaks in the window where only one has?
- **Defaults.** A changed default silently changes behavior for everyone who set nothing.

A break with a named caller is `critical` or `important` and names the caller. If the change is intentionally breaking, the finding asks for the migration note, the version bump or the deprecation path, and does not argue against the break.
