#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'USAGE'
Usage:
  scripts/validate-env.sh --example PATH
  scripts/validate-env.sh --production PATH

Modes:
  --example     Verify that the committed example declares every supported key.
                Empty values are allowed and file permissions are not enforced.
  --production  Validate required values, URL identities, secret strength, and
                owner-only file permissions. Values are never printed.
USAGE
}

[[ $# -eq 2 ]] || { usage >&2; exit 2; }
mode="$1"
env_file="$2"
[[ "$mode" == '--example' || "$mode" == '--production' ]] || {
  usage >&2
  exit 2
}

SUPPORTED_KEYS=(
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL
  REDIS_PASSWORD REDIS_URL
  RABBITMQ_USER RABBITMQ_PASSWORD RABBITMQ_URL
  MINIO_USER MINIO_PASSWORD MINIO_ENDPOINT
  GRAFANA_PASSWORD
  UPRM_MASTER_SECRET UPRM_ADMIN_BOOTSTRAP_TOKEN
  UPRM_ADMIN_JWT_SECRET UPRM_ADMIN_JWT_ISSUER UPRM_ADMIN_JWT_AUDIENCE
  UPRM_ADMIN_JWT_PUBLIC_KEY STRIPE_SECRET_KEY UPRM_WALLET_V2_READS PORT
  UPRM_ADMIN_E2E_BASE_URL UPRM_ADMIN_E2E_EMAIL UPRM_ADMIN_E2E_PASSWORD
)

REQUIRED_KEYS=(
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL
  REDIS_PASSWORD REDIS_URL
  RABBITMQ_USER RABBITMQ_PASSWORD RABBITMQ_URL
  MINIO_USER MINIO_PASSWORD MINIO_ENDPOINT GRAFANA_PASSWORD
  UPRM_MASTER_SECRET UPRM_ADMIN_BOOTSTRAP_TOKEN UPRM_ADMIN_JWT_SECRET
  STRIPE_SECRET_KEY
)

SECRET_KEYS=(
  POSTGRES_PASSWORD REDIS_PASSWORD RABBITMQ_PASSWORD MINIO_PASSWORD
  GRAFANA_PASSWORD UPRM_MASTER_SECRET UPRM_ADMIN_BOOTSTRAP_TOKEN
  UPRM_ADMIN_JWT_SECRET STRIPE_SECRET_KEY
)

declare -A ENV_VALUES=()
uprm_parse_env "$env_file" ENV_VALUES

errors=0
error() {
  printf 'ERROR: %s\n' "$1" >&2
  errors=$((errors + 1))
}

if [[ "$mode" == '--example' ]]; then
  for key in "${SUPPORTED_KEYS[@]}"; do
    [[ -v "ENV_VALUES[$key]" ]] || error "missing supported key: $key"
  done
fi

if [[ "$mode" == '--production' ]]; then
  file_mode="$(stat -c '%a' "$env_file")"
  permission_value=$((8#$file_mode))
  if (( (permission_value & 077) != 0 )); then
    error "production environment file must not be group/world accessible (expected mode 600 or stricter)"
  fi

  for key in "${REQUIRED_KEYS[@]}"; do
    if [[ ! -v "ENV_VALUES[$key]" || -z "${ENV_VALUES[$key]}" ]]; then
      error "required key is empty: $key"
    fi
  done

  for key in "${SECRET_KEYS[@]}"; do
    value="${ENV_VALUES[$key]-}"
    [[ -z "$value" ]] && continue
    uprm_is_placeholder "$value" && error "placeholder value is not allowed: $key"
    if [[ "$key" == UPRM_* && ${#value} -lt 24 ]]; then
      error "$key must contain at least 24 characters"
    elif [[ "$key" != UPRM_* && ${#value} -lt 12 ]]; then
      error "$key must contain at least 12 characters"
    fi
  done

  wallet_flag="${ENV_VALUES[UPRM_WALLET_V2_READS]-}"
  if [[ -n "$wallet_flag" && "$wallet_flag" != true && "$wallet_flag" != false ]]; then
    error "UPRM_WALLET_V2_READS must be true or false when set"
  fi

  validate_url_identity() {
    local key="$1" schemes="$2" expected_user="$3" expected_password="$4" expected_db="${5-}"
    local url="${ENV_VALUES[$key]-}"
    [[ -z "$url" ]] && return
    URL_VALUE="$url" EXPECTED_SCHEMES="$schemes" EXPECTED_USER="$expected_user" \
      EXPECTED_PASSWORD="$expected_password" EXPECTED_DB="$expected_db" \
      python3 - <<'PY' || error "$key is malformed or disagrees with its component settings"
import os
from urllib.parse import unquote, urlsplit

try:
    parsed = urlsplit(os.environ['URL_VALUE'])
    schemes = set(os.environ['EXPECTED_SCHEMES'].split(','))
    valid = parsed.scheme in schemes and bool(parsed.hostname)
    expected_user = os.environ['EXPECTED_USER']
    expected_password = os.environ['EXPECTED_PASSWORD']
    expected_db = os.environ.get('EXPECTED_DB', '')
    if expected_user:
        valid = valid and unquote(parsed.username or '') == expected_user
    if expected_password:
        valid = valid and unquote(parsed.password or '') == expected_password
    if expected_db:
        valid = valid and parsed.path.lstrip('/') == expected_db
    raise SystemExit(0 if valid else 1)
except (TypeError, ValueError):
    raise SystemExit(1)
PY
  }

  validate_url_identity DATABASE_URL 'postgres,postgresql' \
    "${ENV_VALUES[POSTGRES_USER]-}" "${ENV_VALUES[POSTGRES_PASSWORD]-}" \
    "${ENV_VALUES[POSTGRES_DB]-}"
  validate_url_identity RABBITMQ_URL 'amqp,amqps' \
    "${ENV_VALUES[RABBITMQ_USER]-}" "${ENV_VALUES[RABBITMQ_PASSWORD]-}"
  validate_url_identity REDIS_URL 'redis,rediss' '' "${ENV_VALUES[REDIS_PASSWORD]-}"
  validate_url_identity MINIO_ENDPOINT 'http,https' '' ''
fi

if (( errors > 0 )); then
  printf 'Environment validation failed with %d error(s).\n' "$errors" >&2
  exit 1
fi

printf 'Environment validation passed (%s mode, %d supported keys).\n' \
  "${mode#--}" "${#SUPPORTED_KEYS[@]}"
