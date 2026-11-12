#!/usr/bin/env bash
# Takes a data-only copy of the old production database on Supabase, for the move to the new server.
# Asks for the connection string (hidden while you type, never written to a file), then saves the copy to
# backups/production/<date>_final.sql (ignored by git: it holds real people's data) and prints the last migration the
# old database has, which the rehearsal needs. Uses pg_dump from the postgres:17 Docker image.
#   bash deploy/dump-production.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups/production
out="backups/production/$(date +%Y%m%d_%H%M)_final.sql"

echo "Paste the Supabase connection string (Project > Connect > Session pooler, with your password filled in)."
echo "It will not be shown while you paste it. Press Enter afterwards."
read -rs PGURI
echo
# Windows terminals can add a carriage return (and pastes can carry spaces); either would end up in the database name.
PGURI="$(printf '%s' "$PGURI" | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
[ -n "$PGURI" ] || { echo "Nothing pasted." >&2; exit 1; }
case "$PGURI" in postgresql://*|postgres://*) ;; *) echo "That does not look like a connection string (it should start with postgresql://)." >&2; exit 1;; esac
export PGURI

echo "Reading the last applied migration..."
docker run --rm -e PGURI postgres:17 sh -c 'psql "$PGURI" -At -c "select max(version) from supabase_migrations.schema_migrations"' \
  | tee "${out%.sql}.migration.txt"

echo "Copying the data (a minute or two)..."
docker run --rm -e PGURI postgres:17 sh -c 'pg_dump "$PGURI" --data-only --schema=public --schema=auth' > "$out"
unset PGURI

echo "Saved $out ($(du -h "$out" | cut -f1))."
echo "Tables copied: $(grep -c '^COPY ' "$out")"
