#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/create-migration-bundle.sh --env PATH --dump PATH --recipient AGE_RECIPIENT --output PATH [options]

Options:
  --rabbitmq-definitions PATH  RabbitMQ definitions JSON to include
  --allow-dirty                Allow a dirty Git working tree, recorded in manifest
  --help                       Show this help

Creates an age-encrypted tar bundle. The bundle includes manifest.json, PostgreSQL
dump plus checksum/metadata, environment file, and optional RabbitMQ definitions.
USAGE
}

env_file=''
dump_file=''
definitions_file=''
recipient=''
output=''
allow_dirty=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) env_file="$(realpath "${2:?missing value for --env}")"; shift 2 ;;
    --dump) dump_file="$(realpath "${2:?missing value for --dump}")"; shift 2 ;;
    --rabbitmq-definitions) definitions_file="$(realpath "${2:?missing value for --rabbitmq-definitions}")"; shift 2 ;;
    --recipient) recipient="${2:?missing value for --recipient}"; shift 2 ;;
    --output) output="$(realpath -m "${2:?missing value for --output}")"; shift 2 ;;
    --allow-dirty) allow_dirty=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) uprm_die "unknown option: $1"; usage >&2; exit 2 ;;
  esac
done

[[ -n "$env_file" && -n "$dump_file" && -n "$recipient" && -n "$output" ]] || {
  usage >&2
  uprm_die "--env, --dump, --recipient, and --output are required"
  exit 2
}
[[ -f "$env_file" ]] || uprm_die "environment file not found: $env_file"
[[ -f "$dump_file" ]] || uprm_die "dump file not found: $dump_file"
[[ -f "$dump_file.sha256" ]] || uprm_die "dump checksum sidecar missing: $dump_file.sha256"
[[ -f "$dump_file.json" ]] || uprm_die "dump metadata sidecar missing: $dump_file.json"
if [[ -n "$definitions_file" ]]; then
  [[ -f "$definitions_file" ]] || uprm_die "RabbitMQ definitions file not found: $definitions_file"
  [[ -f "$definitions_file.sha256" ]] || uprm_die "RabbitMQ definitions checksum sidecar missing: $definitions_file.sha256"
fi
"$SCRIPT_DIR/validate-env.sh" --production "$env_file" >/dev/null

age_bin="${UPRM_AGE_BIN:-age}"
command -v "$age_bin" >/dev/null 2>&1 || uprm_die "age is required to encrypt migration bundles"

if git -C "$REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  source_commit="$(git -C "$REPO_DIR" rev-parse HEAD)"
  dirty=false
  if [[ -n "$(git -C "$REPO_DIR" status --porcelain)" ]]; then
    dirty=true
  fi
else
  source_commit='unknown'
  dirty=true
fi
if [[ "$dirty" == true && "$allow_dirty" != true ]]; then
  uprm_die "refusing to bundle a dirty source tree without --allow-dirty"
fi

work_dir="$(mktemp -d)"
tmp_output="$(mktemp "$(dirname "$output")/.uprm-migration.XXXXXX.age")"
cleanup() { rm -rf "$work_dir" "$tmp_output"; }
trap cleanup EXIT

install -m 0600 "$env_file" "$work_dir/env"
install -m 0600 "$dump_file" "$work_dir/postgres.dump"
install -m 0600 "$dump_file.sha256" "$work_dir/postgres.dump.sha256"
install -m 0600 "$dump_file.json" "$work_dir/postgres.dump.json"
if [[ -n "$definitions_file" ]]; then
  install -m 0600 "$definitions_file" "$work_dir/rabbitmq-definitions.json"
  install -m 0600 "$definitions_file.sha256" "$work_dir/rabbitmq-definitions.json.sha256"
fi

created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
env_sha="$(sha256sum "$work_dir/env" | cut -d' ' -f1)"
postgres_sha="$(sha256sum "$work_dir/postgres.dump" | cut -d' ' -f1)"
rabbit_sha=''
if [[ -f "$work_dir/rabbitmq-definitions.json" ]]; then
  rabbit_sha="$(sha256sum "$work_dir/rabbitmq-definitions.json" | cut -d' ' -f1)"
fi

CREATED_AT="$created_at" SOURCE_COMMIT="$source_commit" SOURCE_DIRTY="$dirty" \
ENV_SHA="$env_sha" POSTGRES_SHA="$postgres_sha" RABBIT_SHA="$rabbit_sha" \
python3 - <<'PY' >"$work_dir/manifest.json"
import json
import os

artifacts = {
    "environment": {"path": "env", "sha256": os.environ["ENV_SHA"]},
    "postgres_dump": {"path": "postgres.dump", "sha256": os.environ["POSTGRES_SHA"]},
}
if os.environ["RABBIT_SHA"]:
    artifacts["rabbitmq_definitions"] = {
        "path": "rabbitmq-definitions.json",
        "sha256": os.environ["RABBIT_SHA"],
    }
print(json.dumps({
    "format_version": 1,
    "created_at_utc": os.environ["CREATED_AT"],
    "source_commit": os.environ["SOURCE_COMMIT"],
    "source_dirty": os.environ["SOURCE_DIRTY"] == "true",
    "artifacts": artifacts,
}, indent=2, sort_keys=True))
PY

(
  cd "$work_dir"
  tar --sort=name --owner=0 --group=0 --numeric-owner -cf - .
) | "$age_bin" --recipient "$recipient" --output "$tmp_output"

[[ -s "$tmp_output" ]] || uprm_die "encrypted bundle is empty"
mv "$tmp_output" "$output"
trap - EXIT
rm -rf "$work_dir"
printf 'migration_bundle=%s\n' "$output"
