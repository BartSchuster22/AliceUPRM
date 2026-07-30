#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/restore-postgres.sh --dump PATH --confirm-restore DATABASE [options]

Options:
  --env PATH                    Environment file (default: /srv/uprm/.env)
  --dump PATH                   PostgreSQL custom-format dump
  --confirm-restore DATABASE    Must exactly match POSTGRES_DB
  --help                        Show this help

The checksum sidecar PATH.sha256 is mandatory. The restore is refused while UPRM
application services are active. This operation replaces data in the configured
database; take a separate rollback backup first.
USAGE
}

env_file="${UPRM_ENV_FILE:-/srv/uprm/.env}"
dump_file=''
confirmation=''

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) env_file="${2:?missing value for --env}"; shift 2 ;;
    --dump) dump_file="${2:?missing value for --dump}"; shift 2 ;;
    --confirm-restore) confirmation="${2:?missing value for --confirm-restore}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) uprm_die "unknown option: $1"; usage >&2; exit 2 ;;
  esac
done

[[ -n "$dump_file" ]] || { uprm_die "--dump is required"; exit 2; }
[[ -f "$dump_file" ]] || uprm_die "dump not found: $dump_file"
[[ -f "$dump_file.sha256" ]] || uprm_die "checksum sidecar not found: $dump_file.sha256"
"$SCRIPT_DIR/validate-env.sh" --production "$env_file"

declare -A ENV_VALUES=()
uprm_parse_env "$env_file" ENV_VALUES
postgres_user="${ENV_VALUES[POSTGRES_USER]}"
postgres_db="${ENV_VALUES[POSTGRES_DB]}"

if [[ "$confirmation" != "$postgres_db" ]]; then
  uprm_die "restore confirmation must exactly match the configured database name"
  exit 2
fi

(
  cd "$(dirname "$dump_file")"
  sha256sum --check --status "$(basename "$dump_file").sha256"
) || uprm_die "backup checksum verification failed"

if [[ "${UPRM_SKIP_SERVICE_CHECK:-0}" != 1 ]] && command -v systemctl >/dev/null 2>&1; then
  active=()
  for service in uprm-api-core uprm-admin-api uprm-worker; do
    if systemctl is-active --quiet "$service"; then
      active+=("$service")
    fi
  done
  if (( ${#active[@]} > 0 )); then
    uprm_die "refusing restore while application services are active: ${active[*]}"
    exit 1
  fi
fi

compose_file="$REPO_DIR/infra/docker/docker-compose.yml"

# Verify archive readability before invoking a mutating pg_restore.
uprm_docker compose --env-file "$env_file" --file "$compose_file" exec -T postgres \
  pg_restore --list <"$dump_file" >/dev/null

uprm_info "restoring verified backup into database $postgres_db"
uprm_docker compose --env-file "$env_file" --file "$compose_file" exec -T postgres \
  pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error \
  --username "$postgres_user" --dbname "$postgres_db" <"$dump_file"

uprm_info "restore complete; run Prisma migration status and installation verification before starting services"
