# API foundation (development-only storage)

The API is a separate Express process. In one terminal run `bun run dev:api`; in another run `bun run dev`. Vite proxies `/api` requests to `http://127.0.0.1:3001`.

`server/app.ts` provides registration/login/logout/current-user, personal workspaces, project create/list/read/update/archive, project member management, and immutable revision snapshots. Passwords are derived with Node's scrypt; browser sessions use random opaque tokens in HttpOnly, SameSite=Strict cookies, while only token hashes are persisted. Project access is determined from the authenticated session and persisted membership, not client-supplied user IDs. Writes use atomic file replacement and are serialized within one process. Project document input is validated against the versioned spatial schema and updates use expected revision numbers to detect stale writes.

## Run locally

```sh
bun install
bun run dev:api
# second terminal
bun run dev
```

Optional API configuration:

- `API_HOST` (defaults to `127.0.0.1`)
- `API_PORT` (defaults to `3001`)
- `ZYLVEX_DATA_FILE` (defaults to `var/zylvex-space.json` under the repository)
- `API_PROXY_TARGET` (defaults to `http://127.0.0.1:3001`)

Use a private, ignored directory for `ZYLVEX_DATA_FILE`; do not commit real user data. The local JSON store is a development adapter only. It is not safe for multiple server processes, production multi-user workloads, database failover, or managed backup. Production deployment requires a transactional database adapter (target: PostgreSQL), deployment-specific secrets/cookie configuration, database migrations, rate limiting, email verification/recovery, operational monitoring, backup/restore verification, and a reviewed security assessment. This API foundation does not claim production readiness.

## Routes implemented

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/workspaces`
- `GET|POST /api/projects`
- `GET|PUT|DELETE /api/projects/:projectId`
- `GET /api/projects/:projectId/revisions`
- `GET /api/projects/:projectId/revisions/:revisionNumber`
- `POST /api/projects/:projectId/members`
- `GET /api/health`

All project and workspace routes require a valid session. Project revision reads use the same membership check. Workspace membership is required for project creation. Only owners can add project members or archive; owner/editor roles can save; other member roles are read-only.
