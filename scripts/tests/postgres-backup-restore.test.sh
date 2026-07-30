#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP="$ROOT_DIR/scripts/backup-postgres.sh"
RESTORE="$ROOT_DIR/scripts/restore-postgres.sh"
TMP_DIR="$(mktemp -d)"
cleanup() {
  if [[ "${KEEP_TEST_TMP:-0}" == 1 ]]; then
    printf 'kept test directory: %s\n' "$TMP_DIR" >&2
  else
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT

pass=0
fail=0
ok() { printf 'ok - %s\n' "$1"; pass=$((pass + 1)); }
not_ok() { printf 'not ok - %s\n' "$1" >&2; fail=$((fail + 1)); }

FAKE_DOCKER="$TMP_DIR/docker"
cat >"$FAKE_DOCKER" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
printf '%q ' "$@" >>"$FAKE_DOCKER_LOG"
printf '\n' >>"$FAKE_DOCKER_LOG"
if [[ " $* " == *' pg_dump '* ]]; then
  if [[ "${FAKE_DOCKER_FAIL_DUMP:-0}" == 1 ]]; then exit 23; fi
  printf 'UPRM_TEST_CUSTOM_DUMP\n'
elif [[ " $* " == *' pg_restore '* ]]; then
  cat >/dev/null
  if [[ "${FAKE_DOCKER_FAIL_RESTORE:-0}" == 1 ]]; then exit 24; fi
fi
exit 0
FAKE
chmod 755 "$FAKE_DOCKER"
export UPRM_DOCKER_BIN="$FAKE_DOCKER"
export FAKE_DOCKER_LOG="$TMP_DIR/docker.log"
export UPRM_SKIP_SERVICE_CHECK=1

ENV_FILE="$TMP_DIR/.env"
cat >"$ENV_FILE" <<'ENV'
POSTGRES_USER=custom_user
POSTGRES_PASSWORD=postgres-safe-password
POSTGRES_DB=custom_db
DATABASE_URL=postgresql://custom_user:postgres-safe-password@127.0.0.1:5432/custom_db?schema=public
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

OUT_DIR="$TMP_DIR/backups"
if "$BACKUP" --env "$ENV_FILE" --output-dir "$OUT_DIR" --retention-days 7 >"$TMP_DIR/backup.out"; then
  dump_file="$(readlink -f "$OUT_DIR/latest.dump")"
  if [[ -s "$dump_file" && -f "$dump_file.sha256" && -f "$dump_file.json" ]]; then
    ok "backup writes dump, checksum, and metadata atomically"
  else
    not_ok "backup artifacts are incomplete"
  fi
else
  sed 's/^/  /' "$TMP_DIR/backup.out" >&2
  not_ok "valid backup command failed"
fi

if grep -q -- '--username custom_user --dbname custom_db' "$FAKE_DOCKER_LOG"; then
  ok "backup uses configured database identity"
else
  not_ok "backup did not use configured database identity"
fi

rm -rf "$OUT_DIR"
: >"$FAKE_DOCKER_LOG"
set +e
FAKE_DOCKER_FAIL_DUMP=1 "$BACKUP" --env "$ENV_FILE" --output-dir "$OUT_DIR" >"$TMP_DIR/fail.out" 2>"$TMP_DIR/fail.err"
status=$?
set -e
if [[ $status -ne 0 ]] && ! compgen -G "$OUT_DIR/*.dump" >/dev/null; then
  ok "failed dump leaves no completed backup"
else
  not_ok "failed dump left a completed artifact or returned success"
fi

mkdir -p "$OUT_DIR"
printf 'UPRM_TEST_CUSTOM_DUMP\n' >"$OUT_DIR/restore.dump"
(
  cd "$OUT_DIR"
  sha256sum restore.dump >restore.dump.sha256
)

set +e
"$RESTORE" --env "$ENV_FILE" --dump "$OUT_DIR/restore.dump" >"$TMP_DIR/refuse.out" 2>"$TMP_DIR/refuse.err"
status=$?
set -e
if [[ $status -ne 0 ]]; then
  ok "restore refuses without explicit target confirmation"
else
  not_ok "restore ran without confirmation"
fi

printf 'tampered\n' >>"$OUT_DIR/restore.dump"
set +e
"$RESTORE" --env "$ENV_FILE" --dump "$OUT_DIR/restore.dump" --confirm-restore custom_db >"$TMP_DIR/tamper.out" 2>"$TMP_DIR/tamper.err"
status=$?
set -e
if [[ $status -ne 0 ]]; then
  ok "restore refuses a checksum mismatch"
else
  not_ok "restore accepted a tampered dump"
fi

printf 'UPRM_TEST_CUSTOM_DUMP\n' >"$OUT_DIR/restore.dump"
(
  cd "$OUT_DIR"
  sha256sum restore.dump >restore.dump.sha256
)
: >"$FAKE_DOCKER_LOG"
if "$RESTORE" --env "$ENV_FILE" --dump "$OUT_DIR/restore.dump" --confirm-restore custom_db >"$TMP_DIR/restore.out"; then
  if grep -q -- '--username custom_user --dbname custom_db' "$FAKE_DOCKER_LOG"; then
    ok "confirmed restore targets the configured database"
  else
    not_ok "restore command used the wrong database identity"
  fi
else
  sed 's/^/  /' "$TMP_DIR/restore.out" >&2
  not_ok "confirmed valid restore failed"
fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
