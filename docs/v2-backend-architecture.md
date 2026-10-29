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

## Revision: keep supabase-js as the client
Rewriting 95 files to a new client is avoidable. supabase-js (also works in React Native) only needs three things from its server, and the API provides them:
- **`/rest/v1/*`**: forwarded to a self-hosted PostgREST with the caller's token, so the PostgREST query language the pages use (embedding, filters, Range) works unchanged and row-level security decides access. Implemented (`RestProxyController`).
- **`/rest/v1/rpc/{fn}`**: handled by the API itself against the 76-function allow-list (same transaction/role context). Implemented (`RpcController`). Signed-out callers run as `anon`.
- **`/auth/v1/*`** (GoTrue-compatible subset: `token` password + refresh with rotation, `user`, `logout`, `signup`; `recover` sends a one-time PKCE link by SMTP (migration 71) and `/auth/v1/token?grant_type=pkce` exchanges it, which is what the web reset-password page uses; Google/OAuth sign-in is not used by the app and is not implemented). Implemented (`AuthController`).
- **`/storage/v1/object/*`**: public read, upload, delete on a directory (images only, 2 MB, per-user and per-tournament folders). Implemented (`StorageController`).
- **`/realtime/v1/websocket`**: Phoenix protocol, postgres_changes only, fed by `LISTEN/NOTIFY` triggers (migration 69). Implemented (`RealtimeHandler`, `ChangeListener`). Rows of the two `*_public_events` tables are delivered whole; other tables announce key columns only.
All of supabase-js (auth, rest, rpc, storage, realtime) is therefore served by the API; `node api/smoke.mjs` checks it with the real client.
Web and mobile then differ from today only by the project URL, which is how "one backend for both" is met.

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
