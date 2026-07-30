#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VALIDATOR="$ROOT_DIR/scripts/validate-env.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

pass=0
fail=0

record_pass() { printf 'ok - %s\n' "$1"; pass=$((pass + 1)); }
record_fail() { printf 'not ok - %s\n' "$1" >&2; fail=$((fail + 1)); }

run_case() {
  local name="$1" expected="$2"
  shift 2
  set +e
  "$@" >"$TMP_DIR/stdout" 2>"$TMP_DIR/stderr"
  local status=$?
  set -e
  if { [[ "$expected" == pass ]] && [[ $status -eq 0 ]]; } ||
     { [[ "$expected" == fail ]] && [[ $status -ne 0 ]]; }; then
    record_pass "$name"
  else
    printf '%s\n' "stdout:" >&2
    sed 's/^/  /' "$TMP_DIR/stdout" >&2
    printf '%s\n' "stderr:" >&2
    sed 's/^/  /' "$TMP_DIR/stderr" >&2
    record_fail "$name (status=$status, expected=$expected)"
  fi
}

write_good_env() {
  local path="$1"
  cat >"$path" <<'ENV'
POSTGRES_USER=uprm
POSTGRES_PASSWORD=postgres-safe-password
POSTGRES_DB=uprm
DATABASE_URL=postgresql://uprm:postgres-safe-password@127.0.0.1:5432/uprm?schema=public
REDIS_PASSWORD=redis-safe-password
REDIS_URL=redis://:redis-safe-password@127.0.0.1:6379
RABBITMQ_USER=uprm
RABBITMQ_PASSWORD=rabbit-safe-password
RABBITMQ_URL=amqp://uprm:rabbit-safe-password@127.0.0.1:5672
MINIO_USER=uprm
MINIO_PASSWORD=minio-safe-password
MINIO_ENDPOINT=http://127.0.0.1:9000
GRAFANA_PASSWORD=grafana-safe-password
UPRM_MASTER_SECRET=0123456789abcdef0123456789abcdef
UPRM_ADMIN_BOOTSTRAP_TOKEN=0123456789abcdef0123456789abcdef
UPRM_ADMIN_JWT_SECRET=0123456789abcdef0123456789abcdef
UPRM_ADMIN_JWT_ISSUER=
UPRM_ADMIN_JWT_AUDIENCE=
UPRM_ADMIN_JWT_PUBLIC_KEY=
STRIPE_SECRET_KEY=sk_test_nonproductionfixture000000
UPRM_WALLET_V2_READS=false
PORT=
UPRM_ADMIN_E2E_BASE_URL=
UPRM_ADMIN_E2E_EMAIL=
UPRM_ADMIN_E2E_PASSWORD=
ENV
  chmod 600 "$path"
}

GOOD="$TMP_DIR/good.env"
write_good_env "$GOOD"

run_case "valid production environment passes" pass "$VALIDATOR" --production "$GOOD"
run_case "repository example declares every supported key" pass "$VALIDATOR" --example "$ROOT_DIR/.env.example"

MINIMAL="$TMP_DIR/minimal.env"
cp "$GOOD" "$MINIMAL"
sed -i '/^UPRM_ADMIN_JWT_ISSUER=/d; /^UPRM_ADMIN_JWT_AUDIENCE=/d; /^UPRM_ADMIN_JWT_PUBLIC_KEY=/d; /^UPRM_WALLET_V2_READS=/d; /^PORT=/d; /^UPRM_ADMIN_E2E_/d' "$MINIMAL"
run_case "optional production keys may be omitted" pass "$VALIDATOR" --production "$MINIMAL"

MISSING="$TMP_DIR/missing.env"
cp "$GOOD" "$MISSING"
sed -i '/^RABBITMQ_URL=/d' "$MISSING"
run_case "missing required key fails" fail "$VALIDATOR" --production "$MISSING"

PLACEHOLDER="$TMP_DIR/placeholder.env"
cp "$GOOD" "$PLACEHOLDER"
sed -i 's/^UPRM_MASTER_SECRET=.*/UPRM_MASTER_SECRET=CHANGE_ME/' "$PLACEHOLDER"
run_case "placeholder secret fails" fail "$VALIDATOR" --production "$PLACEHOLDER"

MISMATCH="$TMP_DIR/mismatch.env"
cp "$GOOD" "$MISMATCH"
sed -i 's#^RABBITMQ_URL=.*#RABBITMQ_URL=amqp://other:rabbit-safe-password@127.0.0.1:5672#' "$MISMATCH"
run_case "RabbitMQ URL username mismatch fails" fail "$VALIDATOR" --production "$MISMATCH"

DB_MISMATCH="$TMP_DIR/db-mismatch.env"
cp "$GOOD" "$DB_MISMATCH"
sed -i 's#^DATABASE_URL=.*#DATABASE_URL=postgresql://other:postgres-safe-password@127.0.0.1:5432/not_uprm?schema=public#' "$DB_MISMATCH"
run_case "database URL identity mismatch fails" fail "$VALIDATOR" --production "$DB_MISMATCH"

INSECURE="$TMP_DIR/insecure.env"
cp "$GOOD" "$INSECURE"
chmod 644 "$INSECURE"
run_case "group/world-readable production env fails" fail "$VALIDATOR" --production "$INSECURE"

MALICIOUS="$TMP_DIR/malicious.env"
cp "$GOOD" "$MALICIOUS"
printf 'UNUSED_PROBE=$(touch %s)\n' "$TMP_DIR/executed" >>"$MALICIOUS"
run_case "environment contents are parsed, never executed" pass "$VALIDATOR" --production "$MALICIOUS"
if [[ ! -e "$TMP_DIR/executed" ]]; then
  record_pass "command substitution was not executed"
else
  record_fail "command substitution was executed"
fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
