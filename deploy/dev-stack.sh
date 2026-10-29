#!/usr/bin/env bash
# The local development database: plain PostgreSQL 17 and PostgREST in Docker, built the way the VPS has them
# (deploy/bootstrap.sql, every migration except the two auction-reset ones, and the synthetic seed).
#   deploy/dev-stack.sh          rebuild from scratch with the seed   (pnpm db:reset)
#   deploy/dev-stack.sh --bare   rebuild without the seed
#   deploy/dev-stack.sh --stop   stop and remove the containers
# Database: postgresql://postgres:postgres@127.0.0.1:5440/tourny    PostgREST: http://127.0.0.1:3001
# Run the API against it with SPRING_PROFILES_ACTIVE=dev (api/src/main/resources/application-dev.properties).
set -euo pipefail
cd "$(dirname "$0")/.."
JWT_SECRET="dev-only-jwt-secret-0123456789-0123456789"
docker rm -f tourny-dev-db tourny-dev-rest >/dev/null 2>&1 || true
[ "${1:-}" = "--stop" ] && { docker network rm tourny-dev >/dev/null 2>&1 || true; exit 0; }
docker network create tourny-dev >/dev/null 2>&1 || true
docker run -d --name tourny-dev-db --network tourny-dev -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=tourny -p 5440:5432 postgres:17 >/dev/null
until docker exec tourny-dev-db pg_isready -U postgres -d tourny >/dev/null 2>&1; do sleep 1; done; sleep 3
psql_in() { docker exec -i tourny-dev-db psql -U postgres -d tourny -v ON_ERROR_STOP=1 -q "$@"; }
psql_in -v authenticator_password=authpw < deploy/bootstrap.sql
for f in db/migrations/*.sql; do
  case "$f" in *20261003000052*|*20261003000053*) continue;; esac
  psql_in -1 < "$f" > /dev/null || { echo "migration failed: $f" >&2; exit 1; }
done
if [ "${1:-}" != "--bare" ]; then psql_in < db/seed.sql > /dev/null; fi
docker run -d --name tourny-dev-rest --network tourny-dev -p 3001:3000 \
  -e PGRST_DB_URI=postgres://authenticator:authpw@tourny-dev-db:5432/tourny -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT_SECRET" postgrest/postgrest:v12.2.3 >/dev/null
echo "ready: postgresql://postgres:postgres@127.0.0.1:5440/tourny  and  PostgREST on http://127.0.0.1:3001"
