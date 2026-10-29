# Tourny v2 backend: one API for web and mobile

Decision: a single Spring Boot API in front of PostgreSQL serves **both** the Next.js web app and the Expo app. Neither client talks to the database, storage or realtime directly.

## Why this shape
- Business rules already live in Postgres functions (`award_point`, `declare_match_result`, ...). The API stays thin: authenticate, authorise the call, run the function as that user, return JSON.
- Today the web app calls Supabase from 95 files (75 distinct RPCs, 21 storage calls, 7 realtime channels). Moving it onto the API is the bulk of the web work and is what lets the mobile app reuse everything.

## Components
| Concern | Supabase today | v2 on the VPS |
|---|---|---|
| API | PostgREST + RPC | Spring Boot 4 (Maven wrapper in `api/`, Java 21+), JDBC + Flyway |
| Auth | Supabase Auth (email/password, JWT) | Spring Security + own JWT (access 15 min, refresh rotation); `auth.users` data migrated with bcrypt hashes kept |
| Row security | RLS via `auth.uid()` | Per request: `SET LOCAL request.jwt.claim.sub = <user>` in the transaction so existing RLS and `auth.uid()` keep working |
| Storage | `logos`, `player-photos` buckets | `POST /uploads` to disk or S3-compatible store behind nginx; same public paths |
| Realtime | `postgres_changes` | Postgres `LISTEN/NOTIFY` triggers on `score_events`, `matches`, auction tables, relayed over SSE (`/events/matches/{id}`), usable from web and React Native |
| Email/OAuth | Supabase | SMTP + the existing OAuth callback, moved into the API |

## API surface
- `POST /rpc/{function}`: allow-listed generic call of one Postgres function with a JSON body of named args. The allow-list is generated from the 75 RPCs the clients use, so no arbitrary SQL. This keeps the client migration mechanical: `supabase.rpc(name, args)` becomes `api.rpc(name, args)`.
- `GET /views/{name}?filters`: allow-listed reads of public views and the handful of table selects the pages use (`public_fixture_view`, `public_team_view`, `standings`...).
- `POST /auth/login|register|refresh|logout`, `POST /uploads`, `GET /events/...` (SSE).
- Shared TypeScript client package `@tourny/api` (typed from the DB) used by Next.js and Expo, so there is one implementation of auth, retry and realtime.

## Revision: one in-house client, same endpoints
The web and mobile apps use one small client written for this API (`src/lib/api/core.ts`, copied to `mobile/src/lib/client.ts` by `scripts/sync-client.mjs`): queries, functions, accounts, images and live updates over `fetch` and `WebSocket`, no third-party client library. The API serves:
- **`/rest/*`**: forwarded to a self-hosted PostgREST with the caller's token, so embedding, filters and Range work and row-level security decides access (`RestProxyController`). Signed-out callers run as `anon`.
- **`/rpc/{fn}`**: handled by the API itself against the allow-list in `rpc-allowlist.txt` (`RpcController`).
- **`/auth/*`**: `token` (password, refresh with rotation, PKCE code exchange), `signup`, `user`, `logout`, `recover` (one-time PKCE link by SMTP). Google/OAuth sign-in is not used by the app (`AuthController`).
- **`/storage/object/*`**: public read, raw-body upload, delete (images only, 2 MB, per-user and per-tournament folders) (`StorageController`).
- **`/realtime/websocket`**: Phoenix-channel framing, `postgres_changes` only, fed by `LISTEN/NOTIFY` triggers (migration 69) (`RealtimeHandler`, `ChangeListener`). Rows of the two `*_public_events` tables are delivered whole; other tables announce key columns only.
- **`/account/*`** and **`/payments/*`**: account export/deletion and registration fees.
`tests/api-client.test.mjs` checks the client against a fake server; `node api/smoke.mjs` checks it against the running API.

## Order of work
1. Spring Boot skeleton, Flyway baseline from `db/migrations` 1-67 (dropping the destructive 52/53), JWT auth, `/rpc` with RLS context. Tests against a throwaway Postgres.
2. Closing the security holes found in the review while moving: revoke direct table writes (self-approval), enforce suspension, safe redirect.
3. `@tourny/api` client; port the web app file by file (auth first, then scorer/public, then organizer).
4. Uploads and SSE realtime.
5. Expo app on the same client.
6. Data migration from the production backup, rehearsal on a copy, cutover checklist.

## Open points
- JWT claims must carry `sub` and role so the transaction-local settings match what RLS expects (verified via the existing `act_as` pattern in `db/seed.sql`).
- Maven vs Gradle: default Maven wrapper (no global install needed).
- Realtime fan-out on one VPS is fine for a tournament's audience; revisit if a single match has thousands of viewers.
