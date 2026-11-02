#!/bin/sh
# Runs inside the backup container (deploy/compose.yml): one logical dump now and then every
# 24 hours, deleting dumps older than BACKUP_KEEP_DAYS. Connection settings come from PG* vars.
set -u

while true; do
  file="/backups/tienlen-$(date +%F-%H%M).dump"
  if pg_dump --format=custom --no-owner --file="$file.partial"; then
    mv "$file.partial" "$file"
    echo "Backup written: $file"
  else
    rm -f "$file.partial"
    echo "Backup FAILED" >&2
  fi
  find /backups -name '*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
  sleep 86400
done
