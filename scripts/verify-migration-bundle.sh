#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/verify-migration-bundle.sh --bundle PATH --identity AGE_IDENTITY_FILE

Decrypts the bundle into a temporary directory, verifies manifest and artifact
checksums, validates the included environment file, and prints a redacted summary.
USAGE
}

bundle=''
identity=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --bundle) bundle="$(realpath "${2:?missing value for --bundle}")"; shift 2 ;;
    --identity) identity="$(realpath "${2:?missing value for --identity}")"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) uprm_die "unknown option: $1"; usage >&2; exit 2 ;;
  esac
done

[[ -n "$bundle" && -n "$identity" ]] || { usage >&2; uprm_die "--bundle and --identity are required"; exit 2; }
[[ -f "$bundle" ]] || uprm_die "bundle not found: $bundle"
[[ -f "$identity" ]] || uprm_die "identity file not found: $identity"
age_bin="${UPRM_AGE_BIN:-age}"
command -v "$age_bin" >/dev/null 2>&1 || uprm_die "age is required to verify migration bundles"

work_dir="$(mktemp -d)"
tar_file="$work_dir/bundle.tar"
cleanup() { rm -rf "$work_dir"; }
trap cleanup EXIT

"$age_bin" --decrypt --identity "$identity" --output "$tar_file" "$bundle"
tar -xf "$tar_file" -C "$work_dir"

manifest="$work_dir/manifest.json"
[[ -f "$manifest" ]] || uprm_die "bundle manifest is missing"
[[ -f "$work_dir/env" ]] || uprm_die "bundle environment file is missing"
[[ -f "$work_dir/postgres.dump" ]] || uprm_die "bundle PostgreSQL dump is missing"

"$SCRIPT_DIR/validate-env.sh" --production "$work_dir/env" >/dev/null

MANIFEST_PATH="$manifest" WORK_DIR="$work_dir" python3 - <<'PY'
import hashlib
import json
import os
from pathlib import Path

manifest = json.loads(Path(os.environ["MANIFEST_PATH"]).read_text())
work = Path(os.environ["WORK_DIR"])
if manifest.get("format_version") != 1:
    raise SystemExit("unsupported manifest format_version")
artifacts = manifest.get("artifacts") or {}
for name, spec in artifacts.items():
    rel = spec.get("path")
    expected = spec.get("sha256")
    if not rel or not expected:
        raise SystemExit(f"artifact {name} is missing path or sha256")
    path = work / rel
    if not path.is_file():
        raise SystemExit(f"artifact {name} missing: {rel}")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != expected:
        raise SystemExit(f"artifact {name} checksum mismatch")
print(json.dumps({
    "source_commit": manifest.get("source_commit"),
    "source_dirty": manifest.get("source_dirty"),
    "created_at_utc": manifest.get("created_at_utc"),
    "artifact_count": len(artifacts),
}, sort_keys=True))
PY
