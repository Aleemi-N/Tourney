# Move day: from Supabase + Vercel to Coolify

About an hour, at a quiet time (no live match or auction). Tested end to end on a copy of the Coolify setup with the real
data (48 tables, 0 differences, 78 accounts). Everyone keeps their password and signs in again once.

## Before
- The latest `main` is deployed on Coolify and healthy (it contains the two scripts below).
- Tell organizers the time.
- Have the Supabase connection string ready: Supabase > Connect > **Session pooler**, with the database password filled in.

## 1. Pause the old site
Vercel > the tourny project > Settings > Deployment Protection (or point the domain to a maintenance page), so nobody
changes data on the old site during the move.

## 2. Move the data
Coolify > Terminal > the container **db-...** of Tourny:

    bash /init/cutover-load.sh

Type `MOVE`, then paste the connection string (hidden) and press Enter. It copies the data from Supabase, rebuilds the
database, loads everything, applies every newer change and prints `48 tables compared, 0 differ` (an `audit_logs` +1 is fine).

## 3. Move the images
Coolify > Terminal > the container **api-...**:

    bash /app/copy-images.sh

It prints `Images copied: N, not found: M`. A few "not found" are images that were already deleted on the old site.
Then back in the **db** container:

    psql -U postgres -d tourny -c 'DROP TABLE public.zz_image_copy'

## 4. Check
- `https://tourny.appfyniti.com`: the real tournaments, teams, results, player photos and logos are there.
- Sign in with your own account and password; open your tournament as organizer.

## 5. Switch the users
Point the old address at the new site (or announce `https://tourny.appfyniti.com`). The mobile app already uses the new server.

## If something is wrong
Before step 5 nobody is affected: un-pause the old site. Run step 2 again at any time (it starts from scratch).

## A week later
Delete the Supabase project and the Vercel project.
