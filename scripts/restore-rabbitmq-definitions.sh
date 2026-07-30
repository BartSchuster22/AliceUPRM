#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"; source "$SCRIPT_DIR/lib/common.sh"
usage(){ cat <<'USAGE'
Usage: scripts/restore-rabbitmq-definitions.sh --definitions PATH --confirm-import [--env PATH]
Imports RabbitMQ definitions after checksum validation. Does not purge queues.
USAGE
}
env_file="${UPRM_ENV_FILE:-/srv/uprm/.env}"; definitions=; confirm=false
while [[ $# -gt 0 ]]; do case "$1" in --env) env_file="${2:?}"; shift 2;; --definitions) definitions="$(realpath "${2:?}")"; shift 2;; --confirm-import) confirm=true; shift;; --help|-h) usage; exit 0;; *) uprm_die "unknown option: $1"; exit 2;; esac; done
[[ -n "$definitions" ]] || uprm_die "--definitions is required"; [[ "$confirm" == true ]] || uprm_die "--confirm-import is required"; [[ -f "$definitions" && -f "$definitions.sha256" ]] || uprm_die "definitions and PATH.sha256 are required"
"$SCRIPT_DIR/validate-env.sh" --production "$env_file" >/dev/null
( cd "$(dirname "$definitions")" && sha256sum --check --status "$(basename "$definitions").sha256" ) || uprm_die "RabbitMQ definitions checksum verification failed"
python3 -m json.tool "$definitions" >/dev/null
container_path=/tmp/uprm-rabbitmq-definitions.json
uprm_docker compose --env-file "$env_file" --file "$REPO_DIR/infra/docker/docker-compose.yml" cp "$definitions" "rabbitmq:$container_path"
uprm_docker compose --env-file "$env_file" --file "$REPO_DIR/infra/docker/docker-compose.yml" exec -T rabbitmq rabbitmqctl import_definitions "$container_path"
uprm_docker compose --env-file "$env_file" --file "$REPO_DIR/infra/docker/docker-compose.yml" exec -T rabbitmq rm -f "$container_path"
printf 'rabbitmq_definitions_imported=%s
' "$definitions"
