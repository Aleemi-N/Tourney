#!/bin/bash
# Runs once, when the database volume is first created (docker-entrypoint-initdb.d).
# Bootstrap, then every migration in order, each in its own transaction. The two migrations that
# only reset auction data on the old project (52, 53) are skipped.
set -euo pipefail
psql_in() { psql -v ON_ERROR_STOP=1 -q -U postgres -d "$POSTGRES_DB" "$@"; }
psql_in -v authenticator_password="$AUTHENTICATOR_PASSWORD" -f /init/bootstrap.sql
for f in /init/migrations/*.sql; do
  case "$f" in *20261003000052*|*20261003000053*) continue;; esac
  psql_in -1 -f "$f" > /dev/null
done
