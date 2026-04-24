#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/srv/uprm"
COMPOSE_FILE="$REPO_DIR/infra/docker/docker-compose.yml"
ENV_FILE="$REPO_DIR/.env"
BACKUP_DIR="/var/backups/uprm"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$BACKUP_DIR/uprm-postgres-$STAMP.sql.gz"
LATEST_LINK="$BACKUP_DIR/latest.sql.gz"

mkdir -p "$BACKUP_DIR"

TMP_FILE="$(mktemp "$BACKUP_DIR/.uprm-postgres-$STAMP.XXXXXX.sql.gz")"
cleanup() {
  rm -f "$TMP_FILE"
}
trap cleanup EXIT

echo "[uprm-backup] starting pg_dump to $OUT_FILE"

sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U uprm -d uprm --clean --if-exists --no-owner --no-privileges \
  | gzip -9 > "$TMP_FILE"

mv "$TMP_FILE" "$OUT_FILE"
ln -sfn "$OUT_FILE" "$LATEST_LINK"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'uprm-postgres-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "[uprm-backup] wrote $OUT_FILE"
ls -lh "$OUT_FILE"
