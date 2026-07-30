#!/usr/bin/env bash
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
"$repo/scripts/preflight-host.sh" --help >/dev/null
"$repo/scripts/preflight-host.sh" --hostname example.com --repo "$repo" --min-memory-mb 1 --min-disk-mb 1 >/tmp/uprm-preflight-test.out
grep -q 'preflight=passed' /tmp/uprm-preflight-test.out
if "$repo/scripts/preflight-host.sh" --hostname example.com --min-memory-mb 999999999 --min-disk-mb 1 >/tmp/uprm-preflight-test.fail 2>&1; then echo 'expected high-memory preflight to fail' >&2; exit 1; fi
printf 'preflight-host tests passed
'
