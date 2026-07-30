#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/install-system-files.sh --hostname HOST [options] MODE

Modes:
  --dry-run     Validate templates and print target paths without modifying host.
  --apply       Install systemd/Caddy files and enable units (requires root).

Options:
  --repo PATH   Repository root (default: parent directory of this script)
  --env PATH    Production environment file (default: REPO/.env)
  --start       With --apply, start/restart infrastructure and applications
  --help        Show this help
USAGE
}

repo_dir="$(cd "$SCRIPT_DIR/.." && pwd)"
hostname=''
mode=''
env_file=''
start_services=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hostname) hostname="${2:?missing value for --hostname}"; shift 2 ;;
    --repo) repo_dir="$(realpath "${2:?missing value for --repo}")"; shift 2 ;;
    --env) env_file="$(realpath "${2:?missing value for --env}")"; shift 2 ;;
    --dry-run|--apply) [[ -z "$mode" ]] || uprm_die "choose exactly one mode"; mode="$1"; shift ;;
    --start) start_services=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) uprm_die "unknown option: $1"; usage >&2; exit 2 ;;
  esac
done

[[ -n "$hostname" ]] || { uprm_die "--hostname is required"; exit 2; }
[[ -n "$mode" ]] || { uprm_die "--dry-run or --apply is required"; exit 2; }
if [[ ! "$hostname" =~ ^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$ ]]; then
  uprm_die "invalid DNS hostname"
  exit 2
fi
[[ -d "$repo_dir/.git" ]] || uprm_die "repository root does not contain .git: $repo_dir"
env_file="${env_file:-$repo_dir/.env}"

systemd_dir="$repo_dir/infra/systemd"
caddy_template="$repo_dir/infra/caddy/uprm.caddy.example"
units=(uprm-infrastructure uprm-api-core uprm-admin-api uprm-worker)
unit_paths=()
for unit in "${units[@]}"; do
  [[ -f "$systemd_dir/$unit.service" ]] || uprm_die "missing unit template: $unit.service"
  unit_paths+=("$systemd_dir/$unit.service")
done
[[ -f "$caddy_template" ]] || uprm_die "missing Caddy template"

rendered_caddy="$(mktemp)"
trap 'rm -f "$rendered_caddy"' EXIT
HOSTNAME_VALUE="$hostname" TEMPLATE_PATH="$caddy_template" python3 - <<'PY' >"$rendered_caddy"
import os
from pathlib import Path

content = Path(os.environ["TEMPLATE_PATH"]).read_text()
needle = "__UPRM_HOSTNAME__"
if content.count(needle) != 1:
    raise SystemExit("Caddy template must contain exactly one hostname placeholder")
print(content.replace(needle, os.environ["HOSTNAME_VALUE"]), end="")
PY
chmod 0644 "$rendered_caddy"

if ! verify_output="$(systemd-analyze verify "${unit_paths[@]}" 2>&1)"; then
  printf '%s\n' "$verify_output" >&2
  uprm_die "systemd unit validation failed"
fi
if ! verify_output="$(caddy validate --config "$rendered_caddy" --adapter caddyfile 2>&1)"; then
  printf '%s\n' "$verify_output" >&2
  uprm_die "Caddy configuration validation failed"
fi

printf 'Validated hostname: %s\n' "$hostname"
printf 'Systemd target: /etc/systemd/system/{uprm-infrastructure,uprm-api-core,uprm-admin-api,uprm-worker}.service\n'
printf 'Caddy target: /etc/caddy/Caddyfile.d/uprm.caddy\n'

if [[ "$mode" == '--dry-run' ]]; then
  printf 'Dry-run complete; no host files changed.\n'
  exit 0
fi

[[ $EUID -eq 0 ]] || { uprm_die "--apply must run as root"; exit 1; }
[[ -f "$env_file" ]] || uprm_die "production environment file not found: $env_file"
"$repo_dir/scripts/validate-env.sh" --production "$env_file"

for unit in "${units[@]}"; do
  install -o root -g root -m 0644 "$systemd_dir/$unit.service" "/etc/systemd/system/$unit.service"
done
install -d -o root -g root -m 0755 /etc/caddy/Caddyfile.d
install -o root -g root -m 0644 "$rendered_caddy" /etc/caddy/Caddyfile.d/uprm.caddy

systemctl daemon-reload
systemctl enable "${units[@]}.service"
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl reload caddy

if [[ "$start_services" == true ]]; then
  systemctl restart uprm-infrastructure.service
  systemctl restart uprm-api-core.service uprm-admin-api.service uprm-worker.service
fi

printf 'System files installed successfully. start_services=%s\n' "$start_services"
