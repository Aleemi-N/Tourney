#!/usr/bin/env bash
# Builds a throwaway plain-PostgreSQL database the way the VPS will have it: bootstrap, every
# migration (minus the two auction-reset ones), and optionally the synthetic seed.
# Usage: deploy/rehearse.sh [--seed]   -> database "tourny" on localhost:55432 (user postgres / postgres)
set -euo pipefail
cd "$(dirname "$0")/.."
docker rm -f tourny-plain >/dev/null 2>&1 || true
docker run -d --name tourny-plain -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=tourny -p 55432:5432 postgres:17 >/dev/null
until docker exec tourny-plain pg_isready -U postgres -d tourny >/dev/null 2>&1; do sleep 1; done; sleep 3
psql_in() { docker exec -i tourny-plain psql -U postgres -d tourny -v ON_ERROR_STOP=1 -q "$@"; }
psql_in -v authenticator_password=authpw < deploy/bootstrap.sql
for f in db/migrations/*.sql; do
  case "$f" in *20261003000052*|*20261003000053*) continue;; esac
  psql_in -1 < "$f" > /dev/null || { echo "migration failed: $f" >&2; exit 1; }
done
if [ "${1:-}" = "--seed" ]; then psql_in < db/seed.sql > /dev/null; fi
echo "ready: postgresql://postgres:postgres@127.0.0.1:55432/tourny"
