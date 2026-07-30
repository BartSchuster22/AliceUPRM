#!/usr/bin/env bash
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
"$repo/scripts/install-uprm.sh" --help >/dev/null
for phase in check prepare migrate build install-services verify all; do "$repo/scripts/install-uprm.sh" "$phase" --help >/dev/null; done
printf 'install-uprm smoke tests passed
'
