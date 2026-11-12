#!/usr/bin/env bash
# The move from Supabase: run INSIDE the database container of the new server (Coolify > Terminal > db container):
#   bash /init/cutover-load.sh
# It replaces EVERYTHING in the database with the data of the old Supabase project:
#   1. copies the data straight from Supabase (asks for the connection string, hidden; nothing is saved but the copy in /tmp)
#   2. rebuilds the database as it was at the old project's last migration, loads the data, applies every later migration
#   3. compares the row count of every table with the copy, sets the counters (sequences) past the loaded rows
#   4. lists the images the data refers to, for copy-images.sh in the api container
# Everyone keeps their password; everyone signs in again (sessions are not carried over).
set -euo pipefail
DB="${POSTGRES_DB:-tourny}"
MIGRATIONS=/init/migrations
DUMP=/tmp/tourny-final.sql
q() { psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q "$@"; }

echo "This REPLACES EVERYTHING in the '$DB' database with the data from Supabase (the test data here is deleted)."
read -rp "Type MOVE to continue: " answer
[ "$answer" = "MOVE" ] || { echo "Stopped, nothing changed."; exit 1; }

echo "Paste the Supabase connection string (Session pooler, password filled in). It is not shown. Press Enter."
read -rs SUPA; echo
SUPA="$(printf '%s' "$SUPA" | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
case "$SUPA" in postgresql://*|postgres://*) ;; *) echo "That does not look like a connection string." >&2; exit 1;; esac

echo "== 1. Copying the data from Supabase"
LEVEL="$(psql "$SUPA" -At -c "select max(version) from supabase_migrations.schema_migrations")"
echo "   the old database is at migration $LEVEL"
pg_dump "$SUPA" --data-only --table='public.*' --table=auth.users --table=auth.identities -f "$DUMP"
unset SUPA
echo "   copied $(grep -c '^COPY ' "$DUMP") tables ($(du -h "$DUMP" | cut -f1))"

echo "== 2. Rebuilding the database"
psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" -c "CREATE DATABASE \"$DB\""
q -v authenticator_password="$AUTHENTICATOR_PASSWORD" -f /init/bootstrap.sql
loaded=no
load() {
  echo "   loading the data"
  q -1 -c "SET session_replication_role = replica" -f "$DUMP" > /dev/null
  loaded=yes
}
for f in "$MIGRATIONS"/*.sql; do
  base="$(basename "$f")"
  case "$base" in *20261003000052*|*20261003000053*) continue;; esac # auction resets of the old project, never again
  if [ "$loaded" = no ] && [[ "${base:0:14}" > "$LEVEL" ]]; then load; fi
  q -1 -f "$f" > /dev/null
  [ "$loaded" = yes ] && echo "   applied $base"
done
[ "$loaded" = yes ] || load

echo "== 3. Checking"
differ=0; tables=0
while read -r table expected; do
  actual="$(q -At -c "select count(*) from $table")"
  tables=$((tables + 1))
  if [ "$actual" != "$expected" ]; then echo "   DIFFERENT $table: copy $expected, database $actual"; differ=$((differ + 1)); fi
done < <(awk '/^COPY [a-z_"]+\.[a-z_"]+ /{t=$2; n=0; on=1; next} on && $0=="\\."{print t, n; on=0; next} on{n++}' "$DUMP")
echo "   $tables tables compared, $differ differ (an audit_logs +1 is a migration writing an entry)"
q <<'SQL'
-- COPY does not move the counters behind serial and identity columns: set each past the highest loaded value.
DO $$
DECLARE r record; top bigint;
BEGIN
  FOR r IN SELECT format('%I.%I', n.nspname, c.relname) AS tbl, a.attname AS col,
                  pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS seq
           FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname IN ('public', 'auth') AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
             AND pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) IS NOT NULL
  LOOP
    EXECUTE format('SELECT max(%I) FROM %s', r.col, r.tbl) INTO top;
    IF top IS NOT NULL THEN PERFORM setval(r.seq, top); END IF;
  END LOOP;
END $$;
SQL
echo "   counters set"
q -At <<'SQL'
select 'users: ' || count(*) || ' (all with a password: ' || (count(*) = count(encrypted_password)) || ')' from auth.users;
select 'tournaments: ' || count(*) || ', teams: ' || (select count(*) from public.teams) || ', matches: ' || (select count(*) from public.matches)
       || ', players: ' || (select count(*) from public.player_profiles) from public.tournaments;
SQL

echo "== 4. Listing the images for copy-images.sh"
q <<'SQL'
-- A temporary list the api container reads through PostgREST; drop it when the images are copied (see below).
DROP TABLE IF EXISTS public.zz_image_copy;
CREATE TABLE public.zz_image_copy AS
SELECT DISTINCT path FROM (
  SELECT photo_path AS path FROM public.player_profiles UNION ALL SELECT avatar_path FROM public.profiles
  UNION ALL SELECT logo_path FROM public.teams UNION ALL SELECT logo_path FROM public.team_profiles
  UNION ALL SELECT logo_path FROM public.team_owner_applications UNION ALL SELECT logo_path FROM public.organizations
  UNION ALL SELECT logo_path FROM public.tournament_branding UNION ALL SELECT logo_path FROM public.sponsors
) p WHERE path IS NOT NULL AND path <> '' AND path !~ '^(https?:|blob:|/)';
GRANT SELECT ON public.zz_image_copy TO anon;
NOTIFY pgrst, 'reload schema';
SQL
echo "   $(q -At -c 'select count(*) from public.zz_image_copy') images to copy"
rm -f "$DUMP"
echo
echo "Done. Next: open the terminal of the api container and run   bash /app/copy-images.sh"
echo "Then come back here and run   psql -U postgres -d $DB -c 'DROP TABLE public.zz_image_copy'"
