# Deploying Tourny v2 on a VPS

One server, five containers: PostgreSQL, PostgREST, the Spring Boot API (`../api`), the Next.js web app and Caddy (HTTPS). The Expo app talks to the same API URL.

## First start
1. DNS: point `app.<domain>` and `api.<domain>` at the server; open ports 80 and 443.
2. `cp .env.example .env` and fill it in:
   - `JWT_SECRET`: `openssl rand -base64 48`
   - `ANON_KEY`: `JWT_SECRET=<the secret> node make-anon-key.mjs`
   - passwords for the database and the `authenticator` role.
3. `docker compose up -d --build`. On the first start the database volume runs `initdb.sh`: `bootstrap.sql` (roles, auth/storage stubs) and every migration except the two auction resets.
4. Check: `https://api.<domain>/actuator/health` returns `{"status":"UP"}`.

## What was verified
- `./rehearse.sh --seed` builds a throwaway plain-PostgreSQL database; the API tests pass against it with a self-hosted PostgREST (`TOURNY_TEST_DB_URL`, `TOURNY_DB_URL`, `TOURNY_POSTGREST_URL`, see the comment in `ApiIntegrationTest`).
- The compose database init and the API image were run end to end (signup, sign-in, profile created by trigger, row-level security through PostgREST).
- Not run here: the web image build and Caddy/HTTPS (they need real domains).

## Moving production data from Supabase (rehearse on a copy first)
1. Take a fresh dump of the Supabase database: the `public` schema data and `auth.users` / `auth.identities` rows (bcrypt hashes are kept, so passwords keep working).
2. Load the data into the new database after `initdb.sh` has created the schema (`pg_restore --data-only`, `auth` first, then `public`; disable triggers during the load: `--disable-triggers`).
3. Copy the files in the Supabase `logos`, `avatars` and `player-photos` buckets into the `storage` volume under `/data/storage/<bucket>/...` (same object names).
4. Compare row counts per table, then sign in as each role and run the click-through in `docs/`.
5. Cut over by switching the DNS; keep the Supabase project read-only for a week.

## Operations
- Back up the `db-data` volume (or `pg_dump` nightly) and the `storage` volume.
- Rotating `JWT_SECRET` signs everyone out and needs a new `ANON_KEY`.
- Logs: `docker compose logs -f api`.
