#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"; source "$SCRIPT_DIR/lib/common.sh"
usage(){ cat <<'USAGE'
Usage: scripts/check-drain-state.sh [--env PATH] [--json]
Read-only cutover gate. Exits nonzero until database backlogs and RabbitMQ message counts are zero.
USAGE
}
env_file="${UPRM_ENV_FILE:-/srv/uprm/.env}"; json=false
while [[ $# -gt 0 ]]; do case "$1" in --env) env_file="${2:?}"; shift 2;; --json) json=true; shift;; --help|-h) usage; exit 0;; *) uprm_die "unknown option: $1"; exit 2;; esac; done
"$SCRIPT_DIR/validate-env.sh" --production "$env_file" >/dev/null; declare -A ENV_VALUES=(); uprm_parse_env "$env_file" ENV_VALUES
query='select coalesce((select count(*) from outbox_messages where status in ('''pending''','''in_progress''')),0), coalesce((select count(*) from scheduled_postings where status = '''pending'''),0), coalesce((select count(*) from webhook_deliveries where status in ('''pending''','''retrying''')),0);'
db_counts="$(uprm_docker compose --env-file "$env_file" --file "$REPO_DIR/infra/docker/docker-compose.yml" exec -T postgres psql --username "${ENV_VALUES[POSTGRES_USER]}" --dbname "${ENV_VALUES[POSTGRES_DB]}" -AtF ',' -c "$query")"
IFS=',' read -r outbox_pending scheduled_pending webhook_pending <<<"$db_counts"
queue_lines="$(uprm_docker compose --env-file "$env_file" --file "$REPO_DIR/infra/docker/docker-compose.yml" exec -T rabbitmq rabbitmqctl list_queues -q name messages_ready messages_unacknowledged 2>/dev/null || true)"
queue_ready=0; queue_unacked=0
while read -r _name ready unacked; do [[ -z "${ready:-}" ]] && continue; queue_ready=$((queue_ready+ready)); queue_unacked=$((queue_unacked+unacked)); done <<<"$queue_lines"
total=$((outbox_pending+scheduled_pending+webhook_pending+queue_ready+queue_unacked))
if [[ "$json" == true ]]; then printf '{"outbox_pending":%s,"scheduled_pending":%s,"webhook_pending":%s,"rabbitmq_ready":%s,"rabbitmq_unacknowledged":%s,"total_pending":%s}
' "$outbox_pending" "$scheduled_pending" "$webhook_pending" "$queue_ready" "$queue_unacked" "$total"; else printf 'outbox_pending=%s scheduled_pending=%s webhook_pending=%s rabbitmq_ready=%s rabbitmq_unacknowledged=%s total_pending=%s
' "$outbox_pending" "$scheduled_pending" "$webhook_pending" "$queue_ready" "$queue_unacked" "$total"; fi
(( total == 0 ))
