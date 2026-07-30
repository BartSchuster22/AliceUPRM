#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CREATE="$ROOT_DIR/scripts/create-migration-bundle.sh"
VERIFY="$ROOT_DIR/scripts/verify-migration-bundle.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

pass=0
fail=0
ok() { printf 'ok - %s\n' "$1"; pass=$((pass + 1)); }
not_ok() { printf 'not ok - %s\n' "$1" >&2; fail=$((fail + 1)); }

FAKE_AGE="$TMP_DIR/age"
cat >"$FAKE_AGE" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
output=''
decrypt=false
input=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --recipient|-r|--identity|-i) shift 2 ;;
    --output|-o) output="$2"; shift 2 ;;
    --decrypt|-d) decrypt=true; shift ;;
    *) input="$1"; shift ;;
  esac
done
if [[ "$decrypt" == true ]]; then
  if grep -aq 'tamper' "$input"; then exit 42; fi
  cp "$input" "$output"
else
  cat >"$output"
fi
FAKE
chmod 755 "$FAKE_AGE"
export UPRM_AGE_BIN="$FAKE_AGE"

ENV_FILE="$TMP_DIR/.env"
cat >"$ENV_FILE" <<'ENV'
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
STRIPE_SECRET_KEY=sk_test_nonproductionfixture000000
ENV
chmod 600 "$ENV_FILE"

DUMP="$TMP_DIR/uprm.dump"
printf 'synthetic-postgres-dump\n' >"$DUMP"
(
  cd "$TMP_DIR"
  sha256sum uprm.dump >uprm.dump.sha256
)
printf '{"format_version":1}\n' >"$DUMP.json"

DEFINITIONS="$TMP_DIR/rabbitmq-definitions.json"
printf '{"users":[],"vhosts":[],"permissions":[],"queues":[],"exchanges":[],"bindings":[]}\n' >"$DEFINITIONS"
(
  cd "$TMP_DIR"
  sha256sum rabbitmq-definitions.json >rabbitmq-definitions.json.sha256
)

BUNDLE="$TMP_DIR/migration.tar.age"
printf 'AGE-SECRET-KEY-TEST-FIXTURE\n' >"$TMP_DIR/fixture-key"
chmod 600 "$TMP_DIR/fixture-key"
if "$CREATE" --env "$ENV_FILE" --dump "$DUMP" \
    --rabbitmq-definitions "$DEFINITIONS" --recipient age1fixture \
    --output "$BUNDLE" --allow-dirty >"$TMP_DIR/create.out"; then
  [[ -s "$BUNDLE" ]] && ok "migration bundle is created atomically" || not_ok "bundle is empty"
else
  not_ok "valid migration bundle creation failed"
fi

if "$VERIFY" --bundle "$BUNDLE" --identity "$TMP_DIR/fixture-key" >"$TMP_DIR/verify.out"; then
  ok "migration bundle decrypts and verifies every artifact"
else
  not_ok "valid migration bundle verification failed"
fi

printf 'tamper\n' >>"$BUNDLE"
set +e
"$VERIFY" --bundle "$BUNDLE" --identity "$TMP_DIR/fixture-key" >"$TMP_DIR/tamper.out" 2>"$TMP_DIR/tamper.err"
status=$?
set -e
[[ $status -ne 0 ]] && ok "tampered encrypted bundle is rejected" || not_ok "tampered bundle was accepted"

set +e
"$CREATE" --env "$ENV_FILE" --dump "$DUMP" --output "$TMP_DIR/no-recipient.age" --allow-dirty >"$TMP_DIR/no-recipient.out" 2>"$TMP_DIR/no-recipient.err"
status=$?
set -e
[[ $status -ne 0 ]] && ok "bundle creation requires an encryption recipient" || not_ok "bundle accepted no recipient"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
