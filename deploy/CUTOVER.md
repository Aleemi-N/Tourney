# Cutover checklist: Supabase to the VPS

Everything here was rehearsed except the steps marked **(live only)**. Never run `supabase db push` against the old project: it would apply the auction-reset migrations.

## Before the day
1. VPS up with Docker; DNS for `app.<domain>` and `api.<domain>` pointing at it (set the TTL low a day ahead).
2. `deploy/.env` filled in (`JWT_SECRET`, `ANON_KEY`, passwords, SMTP). `docker compose up -d --build` works and `https://api.<domain>/actuator/health` says UP.
3. Rehearse on today's data: take a fresh dump and run `deploy/rehearse-upgrade.sh <dump> 20261007000057`, then `node deploy/verify-counts.mjs <dump>`. Zero differences, no integrity problems. (Last rehearsal, 2026-10-26: 48 tables matched.)
4. Test the new stack with the seed (`deploy/rehearse.sh --seed` or the compose stack): sign in as every role on web and the mobile app, score a match, register a player with a photo, run a password reset email.
5. Tell organizers the date; pick a quiet hour (no live match, no auction running).

## Cutover (about an hour)
1. **(live only)** Freeze the old app: set the Supabase project's site to maintenance (or stop Vercel) so nobody writes.
2. Final dump of the old database: `pg_dump <session pooler string> --data-only --schema=public --schema=auth -f backups/production/<date>_final.sql` (gitignored). Keep it: it is the rollback point.
3. Copy the stored images (buckets `logos`, `avatars`, `player-photos`) from Supabase Storage into the `storage` volume at `/data/storage/<bucket>/<same object names>`. Object names are unchanged, so database paths keep working.
4. On the VPS (fresh volumes, so `initdb.sh` has built the schema): load the data with the rehearsed method:
   `node deploy/extract-data.mjs <final dump> | docker compose exec -T db psql -U postgres -d tourny -v ON_ERROR_STOP=1`
   then apply migrations 58 to 71 if the schema was built from an older state (the compose init already applied all of them, so normally only the data load is needed; run the load with `session_replication_role = replica`, which the extractor sets).
5. Verify: `node deploy/verify-counts.mjs <final dump> postgresql://postgres:<pw>@<vps>:5432/tourny` (open the port briefly or run it inside the container). Expect no differences (an `audit_logs` +1 is a migration writing an entry).
6. Smoke test on the new URLs: public tournament page and images, sign in as an organizer, open the scoreboard, award and undo a point, register a test player and delete it.
7. Point production traffic at the new stack: web at `app.<domain>`, mobile `EXPO_PUBLIC_API_URL` at `https://api.<domain>`. Everyone must sign in again (sessions are not carried over, passwords are).
8. Watch `docker compose logs -f api` for an hour.

## Rollback
Before step 7 nothing has changed for users: unfreeze the old app. After step 7, if something is badly wrong, point DNS back to the old stack and unfreeze it; data entered on the new stack in the meantime is lost unless you re-enter it, so decide within the first hour.

## After
- Keep the Supabase project untouched (read-only) for a week, then delete it.
- Back up nightly: `pg_dump` of the `tourny` database and the `storage` volume, stored off the server.
- Rotate the old Supabase database password if it was ever shared.
- Merge the v2 branch when you are satisfied; do not merge it before the cutover decision is made.

## Known gaps to decide on
- Access tokens last one hour; a suspended or removed user keeps access until the token expires.
- The realtime socket tells any listener that a match row changed (not its contents).
- No automatic database backups on the VPS; set up the nightly job above.
- Mobile app is not on the stores: distribute through Expo (EAS builds) or Expo Go for now.
