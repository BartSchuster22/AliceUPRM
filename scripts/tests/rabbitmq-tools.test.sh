#!/usr/bin/env bash
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
for script in backup-rabbitmq-definitions.sh restore-rabbitmq-definitions.sh check-drain-state.sh; do "$repo/scripts/$script" --help >/dev/null; done
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
printf '{"rabbit_version":"3.13.0","users":[],"vhosts":[],"permissions":[],"queues":[],"exchanges":[],"bindings":[]}
' >"$work/defs.json"
( cd "$work" && sha256sum defs.json > defs.json.sha256 && sha256sum --check --status defs.json.sha256 )
python3 -m json.tool "$work/defs.json" >/dev/null
printf 'rabbitmq tool tests passed
'
