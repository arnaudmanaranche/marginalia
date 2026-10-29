# 0005. `api/` moves to TypeScript, built with `tsc`

Status: accepted, 2026-10-29

Decision: `api/` and `packages/contract` are TypeScript built by `tsc` to `dist/`, with `strict` and `noImplicitAny` on. Native Node type stripping was considered and rejected so that enums and path aliases stay available. The package, the Docker image and the dev loop include the build. The zod schemas are the single source of types.

Status 2026-10-29: renamed and building, with `strictNullChecks` on and `noImplicitAny` still off (see `docs/guidelines/api.md`).

Migration order: rename (`lib/` to `api/`, `.mjs` to `.ts`, `studio/` to `ui/`) with no behavior change, then strictness area by area, then V2 features. Mechanical and behavioral changes are never in one commit.
