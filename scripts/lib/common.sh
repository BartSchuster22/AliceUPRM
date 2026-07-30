#!/usr/bin/env bash
# Shared, side-effect-free helpers for UPRM deployment scripts.

uprm_die() {
  printf 'ERROR: %s\n' "$*" >&2
  return 1
}

uprm_info() {
  printf 'UPRM: %s\n' "$*"
}

uprm_trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

# Parse a dotenv file without sourcing or evaluating it. Results are placed in
# the associative array named by the second argument.
uprm_parse_env() {
  local file="$1" result_name="$2"
  [[ -f "$file" ]] || uprm_die "environment file not found: $file" || return 1

  local -n result="$result_name"
  result=()
  local raw line key value line_number=0
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    line_number=$((line_number + 1))
    line="$(uprm_trim "$raw")"
    [[ -z "$line" || "${line:0:1}" == '#' ]] && continue
    [[ "$line" == export[[:space:]]* ]] && line="$(uprm_trim "${line#export}")"

    if [[ ! "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      uprm_die "invalid environment syntax at $file:$line_number" || return 1
    fi
    key="${BASH_REMATCH[1]}"
    value="$(uprm_trim "${BASH_REMATCH[2]}")"
    if [[ -v "result[$key]" ]]; then
      uprm_die "duplicate environment key: $key" || return 1
    fi
    if [[ ${#value} -ge 2 ]]; then
      if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]] ||
         [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi
    result["$key"]="$value"
  done <"$file"
}

uprm_is_placeholder() {
  local normalized="${1,,}"
  [[ "$normalized" == *change_me* || "$normalized" == *changeme* ||
     "$normalized" == *replace_me* || "$normalized" == *replace-with* ||
     "$normalized" == 'password' || "$normalized" == 'secret' ]]
}

# Run Docker directly, through a test double, or through passwordless sudo.
uprm_docker() {
  if [[ -n "${UPRM_DOCKER_BIN:-}" ]]; then
    "$UPRM_DOCKER_BIN" "$@"
  elif [[ ${EUID:-$(id -u)} -eq 0 ]]; then
    /usr/bin/docker "$@"
  elif /usr/bin/docker info >/dev/null 2>&1; then
    /usr/bin/docker "$@"
  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    sudo /usr/bin/docker "$@"
  else
    uprm_die "Docker access is required (run as root, join the docker group, or configure passwordless sudo)"
  fi
}
