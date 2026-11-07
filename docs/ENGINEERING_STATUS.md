# Engineering status

Last reviewed: 2026-11-07

## Repository baseline (static inspection)

- React/Vite/TypeScript client; current application shell remains the corporate operations console and the earlier local-only foundation screen.
- `SpatialEngine3D.tsx` remains a demonstration Three.js facility scene and local importer; it is not connected to persisted projects.
- Spatial math, parser, provenance, analytics, and project-schema utilities are present.
- Existing package scripts: `bun run lint` (`tsc --noEmit`), `bun run test` (`tsx --test tests/**/*.test.ts`), and `bun run build` (`vite build`).
- No shell execution was available to run these checks during this change. Previous test records are historical, not current validation.

## Phase 0 / baseline

Status: **STATIC AUDIT RECORDED; COMMANDS NOT EXECUTED**

- The inspected tree previously had no configured API process, database migrations, server authentication, or private object storage.
- Existing tests cover spatial math/parsing/analytics/provenance and Three.js disposal. The API tests added here extend coverage but have not yet been executed.

## Phase 1 / project service foundation

Status: **IN DEVELOPMENT (local API foundation; not production-ready)**

- `server/app.ts` adds an Express API with scrypt password derivation, opaque HttpOnly session cookie, authentication middleware, workspace/project membership checks, project CRUD core routes, revisions, audit events, input validation, and expected-revision conflict detection.
- `server/app.ts` uses an atomic, serialized JSON file adapter. This is durable across restarts in a single process, but is explicitly a development-only adapter, not PostgreSQL and not safe for multi-process production.
- `src/types/spatialProject.ts` and `src/utils/spatialProjectSchema.ts` define and validate the renderer-independent versioned project document.
- `tests/projectApi.test.ts` contains API integration tests for registration, persisted reopen/revisions, unauthenticated/cross-user denial, stale revisions, weak password rejection, and invalid document rejection. Results are unverified until run.
- The current `ProjectFoundationView` still uses its previous browser-local demo store and is NOT yet connected to this API; remove/replace that path during the next vertical-slice step. Do not treat its client-only permissions as a security boundary.

## Next work, in order

1. Execute install, typecheck, test, and build in CI/local shell; fix failures and refresh the lockfile with the chosen package manager.
2. Add API-backed browser client and remove insecure local password/session storage from the application path.
3. Add database interface and PostgreSQL migration/adapter before any production deployment.
4. Add stronger auth controls (rate limiting, account recovery/email verification, session revocation UI), request/response schemas, CSRF/origin policy review, and security tests.
5. Implement editor operations, persistent autosave, undo/redo, and generated revision summaries against the authenticated API.

No capability is marked production-ready.
