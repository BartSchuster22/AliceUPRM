#!/usr/bin/env bash
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
"$repo/scripts/verify-installation.sh" --help >/dev/null
printf 'verify-installation smoke tests passed
'
