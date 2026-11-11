# PostgreSQL with Tourny's schema built in: on the first start of an empty volume it runs deploy/initdb.sh (bootstrap, then
# every migration). Used by docker-compose.coolify.yml, where files from the repository cannot be mounted into a container.
FROM postgres:17
COPY --chmod=755 deploy/initdb.sh /docker-entrypoint-initdb.d/10-init.sh
COPY deploy/bootstrap.sql /init/bootstrap.sql
COPY db/migrations /init/migrations
# The repository may be checked out with Windows line endings; the shell script must have Unix ones.
RUN sed -i 's/\r$//' /docker-entrypoint-initdb.d/10-init.sh
