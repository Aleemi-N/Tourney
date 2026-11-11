# Running Tourny on a Coolify server

`docker-compose.coolify.yml` (in the repository root) is the whole stack for Coolify: PostgreSQL (with the schema built in),
PostgREST, the API and the website. Coolify's proxy provides HTTPS, so nothing here publishes a port, and the stack can share
the server with other sites. (Without Coolify, use `deploy/docker-compose.yml`, which brings its own Caddy.)

## 1. Before you start
- **Room on the server.** In Coolify, Servers > your server: Tourny needs about 1 GB of memory while running, and the website
  build needs 1.5 to 2 GB more for a few minutes. With other sites on the server, 4 GB in total is the sensible minimum.
- **Two names in DNS.** Add A records for `app.<your domain>` (website) and `api.<your domain>` (API) pointing at the server's IP.
  The examples below use `app.example.com` and `api.example.com`.
- **The old site stays where it is** (Vercel + Supabase) until step 6.

## 2. Create the resource
1. Projects > New Project, name it `Tourny`, open its `production` environment.
2. Add Resource > Private Repository (GitHub App) for `Aleemi-N/Tourney`, or Public Repository if the repository is public.
3. Branch `main`. Build Pack **Docker Compose**. Base Directory `/`. Docker Compose Location **`/docker-compose.coolify.yml`**.
4. Load the compose file. Coolify lists four services: `db`, `postgrest`, `api`, `web`.

## 3. Domains
In the resource's configuration, set the domain of two services (the `:port` tells Coolify where the service listens):
- `web`: `https://app.example.com:3000`
- `api`: `https://api.example.com:8080`

Leave `db` and `postgrest` without a domain: they are only reachable inside the stack.

## 4. Environment variables
Fill these in under Environment Variables (Coolify shows every `${...}` from the compose file):

| Variable | Value |
|---|---|
| `APP_DOMAIN` | `app.example.com` (no https://) |
| `API_DOMAIN` | `api.example.com` |
| `DB_PASSWORD` | a long random password |
| `AUTHENTICATOR_PASSWORD` | another long random password |
| `JWT_SECRET` | 32+ random bytes, e.g. `openssl rand -base64 48` |
| `SECRETS_KEY` | for Razorpay only: `openssl rand -base64 32`. Back it up and never change it |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | for "forgot password" emails (Brevo, Resend, Gmail app password...). `MAIL_FROM` must be an address the SMTP service may send from |
| `CONTACT_EMAIL` | shown on the privacy and terms pages |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional browser push: `node deploy/make-vapid-keys.mjs` |
| `EXPO_ACCESS_TOKEN` | optional, only with Expo's enhanced push security |

`APP_DOMAIN`, `API_DOMAIN` and `VAPID_PUBLIC_KEY` are built into the website: after changing them, redeploy.
Keep the values somewhere safe outside Coolify too (a password manager).

## 5. Deploy and check
1. Deploy. The first build takes several minutes (the website and the API are compiled on the server).
2. On the first start of its empty volume the database runs every migration by itself (the two auction-reset ones are skipped).
3. Check `https://api.example.com/actuator/health` says `{"status":"UP"}` and `https://app.example.com` loads.
4. The database is empty: sign up to try it. The real data comes in step 6.

## 6. Move the real data and switch over
Follow `deploy/CUTOVER.md` (rehearse it on a copy first). On Coolify the commands run in the containers through
Coolify's Terminal (or `docker exec` on the server; `docker ps` shows the container names):
- the data dump is loaded into the `db` container with `psql` / `pg_restore`;
- the images go into the `api` container under `/data/storage/<bucket>/` (buckets `logos`, `avatars`, `player-photos`).

Then point your live domain at the server (or use the new names), build the mobile app with
`EXPO_PUBLIC_API_URL=https://api.example.com`, keep the Supabase project read-only for a week and delete it and the Vercel project.

## 7. Backups and monitoring
- **Database:** add a Scheduled Task on the resource, container `db`, every night:
  `pg_dump -U postgres -d tourny --format=custom -f /var/lib/postgresql/data/backup-$(date +%a).dump`
  (keeps one dump per weekday inside the database volume). Copy them off the server regularly as well, e.g. with Coolify's S3
  backup settings or a cron job on the server: a backup on the same disk does not survive the disk.
- **Images:** they live in the `tourny-storage` volume; include it in the server's backups.
- **Monitoring:** point an uptime monitor (UptimeRobot, Better Stack) at `https://api.example.com/actuator/health` and
  `https://app.example.com/api/health`.

## Updates
Every deploy rebuilds from `main` (turn on Coolify's automatic deploy on push if you want it). New migrations do **not** run
by themselves on an existing database. Each deploy copies them into the `db` image, so apply the new ones in order from
Coolify's Terminal in the `db` container: `psql -U postgres -d tourny -v ON_ERROR_STOP=1 -1 -f /init/migrations/<file>.sql`.
