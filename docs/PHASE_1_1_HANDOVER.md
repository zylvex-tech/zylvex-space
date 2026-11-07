# Phase 1.1 handover

## Scope

The active application view is being moved from browser-local account/project state to the same-origin authenticated API. This branch still uses the development JSON persistence adapter; this is not a production persistence setup.

## Status

- API client uses same-origin fetch and browser-managed HttpOnly session cookies; no password or session token is read from localStorage.
- Login, registration, logout, current-user lookup, workspace loading, project create/list/open/save/archive, and revision history are connected to the Express API.
- Room creation writes room, perimeter walls, and a manual/unreviewed length measurement into the canonical v1 project document before sending an expected-revision save.
- A stale-save response is surfaced as a reload-needed conflict message.
- Existing localStorage authentication helpers remain in `src/lib/projectFoundation.ts` for old tests/compatibility but are no longer imported by the active app component. They must be removed after checking for other consumers.

## Verification

The GitHub file-edit environment cannot install dependencies or execute shell commands. Type check, tests, and build have not been run for this change and must not be reported as passing. Check the `App.tsx` import target carefully: this commit corrects it to the actual component location `src/components/ProjectFoundationView.tsx`.

## Remaining risks and next steps

1. Run `bun install`, `bun run lint`, `bun run test`, and `bun run build` in a shell-enabled checkout and fix discovered issues.
2. Add API-level lifecycle and role tests, CSRF/Origin policy, rate limiting, logout/session expiry coverage, and archived-project write protection/revision records.
3. Extract the persistence interface and implement PostgreSQL only with migrations and integration tests; JSON storage is one process only.
4. Review the browser view for all role-based controls and enable project restore only after an API restore route is implemented.
5. Replace the JSON adapter before deploying the API beyond local development.
