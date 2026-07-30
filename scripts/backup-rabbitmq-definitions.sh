#!/usr/bin/env bash
set -euo pipefail
umask 077
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"; source "$SCRIPT_DIR/lib/common.sh"
usage(){ cat <<'USAGE'
Usage: scripts/backup-rabbitmq-definitions.sh [--env PATH] [--output-dir PATH]
Exports RabbitMQ definitions JSON plus SHA-256 sidecar. Definitions contain credential hashes; treat as secret.
USAGE
}
env_file="${UPRM_ENV_FILE:-/srv/uprm/.env}"; output_dir="${UPRM_BACKUP_DIR:-/var/backups/uprm}"
while [[ $# -gt 0 ]]; do case "$1" in --env) env_file="${2:?}"; shift 2;; --output-dir) output_dir="${2:?}"; shift 2;; --help|-h) usage; exit 0;; *) uprm_die "unknown option: $1"; exit 2;; esac; done
"$SCRIPT_DIR/validate-env.sh" --production "$env_file" >/dev/null
mkdir -p "$output_dir"; stamp="$(date -u +%Y%m%dT%H%M%SZ)"; final="$output_dir/rabbitmq-definitions-$stamp.json"; tmp="$(mktemp "$output_dir/.rabbitmq-definitions.XXXXXX.json")"; trap 'rm -f "$tmp" "$tmp.sha256"' EXIT
uprm_docker compose --env-file "$env_file" --file "$REPO_DIR/infra/docker/docker-compose.yml" exec -T rabbitmq rabbitmqctl export_definitions - --format json >"$tmp"
python3 -m json.tool "$tmp" >/dev/null; [[ -s "$tmp" ]] || uprm_die "RabbitMQ definitions export is empty"
sha="$(sha256sum "$tmp" | cut -d' ' -f1)"; printf '%s  %s
' "$sha" "$(basename "$final")" >"$tmp.sha256"
mv "$tmp.sha256" "$final.sha256"; mv "$tmp" "$final"; ln -sfn "$final" "$output_dir/latest-rabbitmq-definitions.json"; trap - EXIT
printf 'rabbitmq_definitions=%s
sha256=%s
' "$final" "$sha"
