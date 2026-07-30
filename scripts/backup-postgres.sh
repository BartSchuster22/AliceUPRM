#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/backup-postgres.sh [options]

Options:
  --env PATH              Environment file (default: /srv/uprm/.env)
  --output-dir PATH       Backup directory (default: /var/backups/uprm)
  --retention-days DAYS   Delete complete backups older than DAYS (default: 14)
  --help                  Show this help

Produces an atomic PostgreSQL custom-format dump, SHA-256 sidecar, JSON metadata,
and a latest.dump symlink. No environment values are printed.
USAGE
}

env_file="${UPRM_ENV_FILE:-/srv/uprm/.env}"
output_dir="${UPRM_BACKUP_DIR:-/var/backups/uprm}"
retention_days="${RETENTION_DAYS:-14}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) env_file="${2:?missing value for --env}"; shift 2 ;;
    --output-dir) output_dir="${2:?missing value for --output-dir}"; shift 2 ;;
    --retention-days) retention_days="${2:?missing value for --retention-days}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) uprm_die "unknown option: $1"; usage >&2; exit 2 ;;
  esac
done

[[ "$retention_days" =~ ^[0-9]+$ ]] || uprm_die "retention days must be a non-negative integer"
"$SCRIPT_DIR/validate-env.sh" --production "$env_file"

declare -A ENV_VALUES=()
uprm_parse_env "$env_file" ENV_VALUES
postgres_user="${ENV_VALUES[POSTGRES_USER]}"
postgres_db="${ENV_VALUES[POSTGRES_DB]}"
compose_file="$REPO_DIR/infra/docker/docker-compose.yml"

mkdir -p "$output_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="uprm-postgres-$stamp"
final_dump="$output_dir/$base.dump"
final_checksum="$final_dump.sha256"
final_metadata="$final_dump.json"
tmp_dump="$(mktemp "$output_dir/.$base.XXXXXX.dump")"
tmp_checksum="$tmp_dump.sha256"
tmp_metadata="$tmp_dump.json"

cleanup() {
  rm -f "$tmp_dump" "$tmp_checksum" "$tmp_metadata"
}
trap cleanup EXIT

uprm_info "creating PostgreSQL backup $final_dump"
uprm_docker compose --env-file "$env_file" --file "$compose_file" exec -T postgres \
  pg_dump --username "$postgres_user" --dbname "$postgres_db" \
  --format=custom --clean --if-exists --no-owner --no-privileges >"$tmp_dump"

[[ -s "$tmp_dump" ]] || uprm_die "pg_dump produced an empty backup"

# Validate the custom archive before publishing it.
uprm_docker compose --env-file "$env_file" --file "$compose_file" exec -T postgres \
  pg_restore --list <"$tmp_dump" >/dev/null

checksum="$(sha256sum "$tmp_dump" | cut -d' ' -f1)"
printf '%s  %s\n' "$checksum" "$(basename "$final_dump")" >"$tmp_checksum"

commit="unknown"
dirty=false
if git -C "$REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  commit="$(git -C "$REPO_DIR" rev-parse HEAD)"
  if [[ -n "$(git -C "$REPO_DIR" status --porcelain)" ]]; then
    dirty=true
  fi
fi

BACKUP_NAME="$(basename "$final_dump")" BACKUP_SHA256="$checksum" \
SOURCE_COMMIT="$commit" SOURCE_DIRTY="$dirty" CREATED_AT="$stamp" \
POSTGRES_DATABASE="$postgres_db" python3 - <<'PY' >"$tmp_metadata"
import json
import os

print(json.dumps({
    "format_version": 1,
    "created_at_utc": os.environ["CREATED_AT"],
    "artifact": os.environ["BACKUP_NAME"],
    "sha256": os.environ["BACKUP_SHA256"],
    "source_commit": os.environ["SOURCE_COMMIT"],
    "source_dirty": os.environ["SOURCE_DIRTY"] == "true",
    "database": os.environ["POSTGRES_DATABASE"],
    "dump_format": "postgres-custom",
}, indent=2, sort_keys=True))
PY

# Publish sidecars first and the dump last so a visible .dump always has metadata.
mv "$tmp_checksum" "$final_checksum"
mv "$tmp_metadata" "$final_metadata"
mv "$tmp_dump" "$final_dump"
ln -sfn "$final_dump" "$output_dir/latest.dump"

# Retain only complete timestamped backup sets.
while IFS= read -r old_dump; do
  rm -f "$old_dump" "$old_dump.sha256" "$old_dump.json"
done < <(find "$output_dir" -maxdepth 1 -type f -name 'uprm-postgres-*.dump' -mtime +"$retention_days" -print)

trap - EXIT
uprm_info "backup complete: $final_dump"
printf 'sha256=%s\n' "$checksum"
