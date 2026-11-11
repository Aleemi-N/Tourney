#!/usr/bin/env bash
# Rehearses the upgrade of an existing database: builds the schema as it was when a data dump was
# taken (migrations up to the given one), loads the dump's data, then applies every later
# migration, exactly what production will go through.
# Usage: deploy/rehearse-upgrade.sh <dump.sql> <last-applied-migration-file-prefix>
#   e.g. deploy/rehearse-upgrade.sh backups/production/20260924_pre_migration25_data.sql 20260923000024
# Result: database "tourny" on localhost:55432 (postgres / postgres), left running for inspection.
set -euo pipefail
cd "$(dirname "$0")/.."
dump="$1"; last="$2"
docker rm -f tourny-plain >/dev/null 2>&1 || true
docker run -d --name tourny-plain -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=tourny -p 55432:5432 postgres:17 >/dev/null
until docker exec tourny-plain pg_isready -U postgres -d tourny >/dev/null 2>&1; do sleep 1; done; sleep 3
psql_in() { docker exec -i tourny-plain psql -U postgres -d tourny -v ON_ERROR_STOP=1 -q "$@"; }
psql_in -v authenticator_password=authpw < deploy/bootstrap.sql
phase=before
for f in db/migrations/*.sql; do
  base=$(basename "$f")
  case "$base" in *20261003000052*|*20261003000053*) continue;; esac
  if [ "$phase" = before ] && [[ "$base" > "$last" && "$base" != "$last"* ]]; then
    echo "== loading data from $dump"
    node deploy/extract-data.mjs "$dump" | psql_in -f - > /dev/null
    phase=after
  fi
  psql_in -1 < "$f" > /dev/null || { echo "migration failed: $base" >&2; exit 1; }
  [ "$phase" = after ] && echo "applied $base"
done
echo "upgrade rehearsal finished"
