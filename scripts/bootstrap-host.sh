#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
usage(){ cat <<'USAGE'
Usage: scripts/bootstrap-host.sh --dry-run|--apply [--repo PATH] [--user USER]
Creates only UPRM service user/directories and installs base OS packages. It never writes .env, restores data, changes DNS, or starts UPRM services.
USAGE
}
repo=/srv/uprm; service_user=uprm; mode=
while [[ $# -gt 0 ]]; do case "$1" in --repo) repo="$(realpath -m "${2:?}")"; shift 2;; --user) service_user="${2:?}"; shift 2;; --dry-run|--apply) [[ -z "$mode" ]] || uprm_die "choose one mode"; mode="$1"; shift;; --help|-h) usage; exit 0;; *) uprm_die "unknown option: $1"; exit 2;; esac; done
[[ -n "$mode" ]] || { usage >&2; uprm_die "--dry-run or --apply is required"; exit 2; }
[[ "$mode" == --dry-run || ${EUID:-$(id -u)} -eq 0 ]] || uprm_die "--apply must run as root"
run(){ if [[ "$mode" == --dry-run ]]; then printf '+ '; printf '%q ' "$@"; printf '
'; else "$@"; fi; }
printf 'Bootstrap target: user=%s repo=%s mode=%s
' "$service_user" "$repo" "$mode"
getent passwd "$service_user" >/dev/null 2>&1 || run useradd --create-home --shell /bin/bash "$service_user"
run install -d -o "$service_user" -g "$service_user" -m 0755 "$repo"
run install -d -o root -g root -m 0700 /var/backups/uprm
run install -d -o "$service_user" -g "$service_user" -m 0755 /var/log/uprm
if command -v apt-get >/dev/null 2>&1; then run apt-get update; run apt-get install -y --no-install-recommends git curl ca-certificates gnupg xz-utils python3 openssl ufw; else printf 'WARN: apt-get not found; install base packages manually
' >&2; fi
printf 'Bootstrap complete. Install Docker, Caddy, Node v20.20.2, pnpm 10.33.0, then clone UPRM.
'
