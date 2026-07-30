#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"; source "$SCRIPT_DIR/lib/common.sh"
usage(){ cat <<'USAGE'
Usage: scripts/verify-installation.sh [--repo PATH] [--env PATH] [--hostname HOST] [--json]
Read-only acceptance verifier for clean installs and migration targets.
USAGE
}
repo="$REPO_DIR"; env_file=; hostname=; json=false
while [[ $# -gt 0 ]]; do case "$1" in --repo) repo="$(realpath "${2:?}")"; shift 2;; --env) env_file="$(realpath "${2:?}")"; shift 2;; --hostname) hostname="${2:?}"; shift 2;; --json) json=true; shift;; --help|-h) usage; exit 0;; *) uprm_die "unknown option: $1"; exit 2;; esac; done
env_file="${env_file:-$repo/.env}"; compose_file="$repo/infra/docker/docker-compose.yml"; "$repo/scripts/validate-env.sh" --production "$env_file" >/dev/null
checks=(); statuses=(); record(){ checks+=("$1"); statuses+=("$2"); }
try(){ local name="$1"; shift; if "$@" >/tmp/uprm-verify.$$ 2>&1; then record "$name" pass; else record "$name" fail; fi; }; trap 'rm -f /tmp/uprm-verify.$$' EXIT
try git_repo git -C "$repo" rev-parse --is-inside-work-tree
try compose_config uprm_docker compose --env-file "$env_file" --file "$compose_file" config --quiet
try compose_ps uprm_docker compose --env-file "$env_file" --file "$compose_file" ps
try prisma_status bash -lc "cd '$repo' && pnpm --filter @uprm/db exec prisma migrate status --schema packages/db/prisma/schema.prisma"
for svc in uprm-infrastructure uprm-api-core uprm-admin-api uprm-worker; do if command -v systemctl >/dev/null 2>&1; then try "systemd_$svc" systemctl is-active --quiet "$svc"; else record "systemd_$svc" skipped; fi; done
try api_core_loopback curl --fail --silent --show-error http://127.0.0.1:4000/
try admin_api_loopback curl --fail --silent --show-error http://127.0.0.1:4001/healthz
try worker_health curl --fail --silent --show-error http://127.0.0.1:4002/healthz
try worker_metrics curl --fail --silent --show-error http://127.0.0.1:4002/metrics
if command -v ss >/dev/null 2>&1 && ss -ltnH | awk '{print $4}' | grep -Ev '^(127\.0\.0\.1|\[::1\]|0\.0\.0\.0:80|0\.0\.0\.0:443|\[::\]:80|\[::\]:443)' | grep -E ':(4000|4001|4002|5432|5672|6379|9000|9001|9090|15672|3001|3100)$' >/dev/null; then record loopback_binding fail; else record loopback_binding pass; fi
[[ -n "$hostname" ]] && { try public_https curl --fail --silent --show-error "https://$hostname/"; try public_tenant_route curl --fail --silent --show-error "https://$hostname/v1/"; }
failed=0; for status in "${statuses[@]}"; do [[ "$status" == fail ]] && failed=$((failed+1)); done
if [[ "$json" == true ]]; then printf '{"failed":%s}
' "$failed"; else for i in "${!checks[@]}"; do printf '%-28s %s
' "${checks[$i]}" "${statuses[$i]}"; done; printf 'verification_failed=%d
' "$failed"; fi
(( failed == 0 ))
