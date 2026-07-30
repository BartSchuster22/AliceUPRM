#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
usage(){ cat <<'USAGE'
Usage: scripts/preflight-host.sh --hostname HOST [--repo PATH] [--min-memory-mb N] [--min-disk-mb N] [--require-dns]
Read-only host preflight for UPRM. Does not install, write, delete, or start services.
USAGE
}
repo=/srv/uprm; hostname=; min_memory_mb=7800; min_disk_mb=20480; require_dns=false
while [[ $# -gt 0 ]]; do case "$1" in --repo) repo="$(realpath -m "${2:?}")"; shift 2;; --hostname) hostname="${2:?}"; shift 2;; --min-memory-mb) min_memory_mb="${2:?}"; shift 2;; --min-disk-mb) min_disk_mb="${2:?}"; shift 2;; --require-dns) require_dns=true; shift;; --help|-h) usage; exit 0;; *) uprm_die "unknown option: $1"; exit 2;; esac; done
[[ -n "$hostname" ]] || { usage >&2; uprm_die "--hostname is required"; exit 2; }
errors=0; warns=0
error(){ printf 'ERROR: %s
' "$1" >&2; errors=$((errors+1)); }
warn(){ printf 'WARN: %s
' "$1" >&2; warns=$((warns+1)); }
if [[ -r /etc/os-release ]]; then . /etc/os-release; [[ "${ID:-}" == ubuntu ]] || error "supported OS is Ubuntu; found ${PRETTY_NAME:-unknown}"; [[ "${VERSION_ID:-}" =~ ^(22\.04|24\.04)$ ]] || warn "tested Ubuntu versions are 22.04/24.04; found ${VERSION_ID:-unknown}"; else error "/etc/os-release is not readable"; fi
for cmd in git curl python3 openssl systemctl ss df awk stat id getent; do command -v "$cmd" >/dev/null 2>&1 || error "missing required command: $cmd"; done
for cmd in docker caddy node corepack pnpm; do command -v "$cmd" >/dev/null 2>&1 || warn "missing command needed before apply: $cmd"; done
mem_kb="$(awk '/MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || printf 0)"; mem_mb=$((mem_kb/1024)); (( mem_mb >= min_memory_mb )) || error "memory ${mem_mb}MiB is below required ${min_memory_mb}MiB"
repo_parent="$(dirname "$repo")"; [[ -d "$repo_parent" ]] || error "repository parent does not exist: $repo_parent"
if [[ -d "$repo_parent" ]]; then free_mb="$(df -Pm "$repo_parent" | awk 'NR==2 {print $4}')"; (( free_mb >= min_disk_mb )) || error "free disk ${free_mb}MiB at $repo_parent is below required ${min_disk_mb}MiB"; fi
if [[ -e "$repo" && ! -d "$repo/.git" ]]; then error "repo path exists but is not a Git repository: $repo"; elif [[ -d "$repo/.git" ]]; then owner="$(stat -c '%U' "$repo")"; [[ "$owner" == uprm ]] || warn "repo owner is $owner; production expects uprm"; fi
getent passwd uprm >/dev/null 2>&1 || warn "service user uprm does not exist yet"
if [[ "$require_dns" == true ]]; then resolved="$(getent ahosts "$hostname" | awk '{print $1}' | sort -u | paste -sd, - || true)"; [[ -n "$resolved" ]] || error "hostname does not resolve: $hostname"; fi
if (( errors > 0 )); then printf 'preflight=failed errors=%d warnings=%d
' "$errors" "$warns" >&2; exit 1; fi
printf 'preflight=passed warnings=%d repo=%s hostname=%s
' "$warns" "$repo" "$hostname"
