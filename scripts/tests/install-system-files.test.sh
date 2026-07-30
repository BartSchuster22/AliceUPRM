#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALLER="$ROOT_DIR/scripts/install-system-files.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

pass=0
fail=0
ok() { printf 'ok - %s\n' "$1"; pass=$((pass + 1)); }
not_ok() { printf 'not ok - %s\n' "$1" >&2; fail=$((fail + 1)); }

set +e
"$INSTALLER" --hostname 'bad host;rm -rf /' --dry-run >"$TMP_DIR/bad.out" 2>"$TMP_DIR/bad.err"
status=$?
set -e
[[ $status -ne 0 ]] && ok "invalid hostname is rejected" || not_ok "invalid hostname was accepted"

if "$INSTALLER" --hostname uprm.example.test --repo "$ROOT_DIR" --dry-run >"$TMP_DIR/dry.out"; then
  if grep -q 'uprm.example.test' "$TMP_DIR/dry.out" &&
     grep -q '/etc/systemd/system' "$TMP_DIR/dry.out" &&
     grep -q '/etc/caddy/Caddyfile.d/uprm.caddy' "$TMP_DIR/dry.out"; then
    ok "dry-run validates and describes system file installation"
  else
    not_ok "dry-run output omitted installation targets"
  fi
else
  not_ok "valid dry-run failed"
fi

set +e
"$INSTALLER" --hostname uprm.example.test --repo "$ROOT_DIR" --apply >"$TMP_DIR/apply.out" 2>"$TMP_DIR/apply.err"
status=$?
set -e
if [[ $(id -u) -ne 0 && $status -ne 0 ]]; then
  ok "apply requires root"
elif [[ $(id -u) -eq 0 ]]; then
  not_ok "test must not run apply as root"
else
  not_ok "non-root apply was accepted"
fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
