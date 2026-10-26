#!/usr/bin/env bash
# Nightly backup of the database and uploaded images, keeping the last 14 days.
# Run from the deploy folder (cron: 30 2 * * * cd /opt/tourny/deploy && ./backup.sh).
# Copy the BACKUP_DIR contents off the server too (another machine or object storage).
set -euo pipefail
cd "$(dirname "$0")"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
docker compose exec -T db pg_dump -U postgres -d tourny --format=custom > "$BACKUP_DIR/db-$STAMP.dump"
docker compose exec -T api tar -C /data -cz storage > "$BACKUP_DIR/storage-$STAMP.tar.gz"
# A dump that cannot be listed is not a backup.
docker compose exec -T db pg_restore --list < "$BACKUP_DIR/db-$STAMP.dump" > /dev/null
find "$BACKUP_DIR" -type f \( -name 'db-*.dump' -o -name 'storage-*.tar.gz' \) -mtime +14 -delete
echo "backup $STAMP ok: $(du -h "$BACKUP_DIR/db-$STAMP.dump" | cut -f1) database, $(du -h "$BACKUP_DIR/storage-$STAMP.tar.gz" | cut -f1) images"
