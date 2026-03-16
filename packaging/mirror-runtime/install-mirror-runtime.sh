#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Mirror Runtime installer

Usage:
  ./install-mirror-runtime.sh [options]

Options:
  --runtime-root <path>  Install runtime payload here (default: /opt/mirror-runtime)
  --config-dir <path>    Config directory (default: ~/.config/mirror-runtime)
  --data-dir <path>      Data directory (default: ~/.local/share/mirror-runtime)
  --state-dir <path>     State directory (default: ~/.local/state/mirror-runtime)
  --unit-dir <path>      systemd --user unit dir (default: ~/.config/systemd/user)
  --provider-url <url>   Write MIRROR_PROVIDER_URL into the env file
  --provider-token <t>   Write MIRROR_PROVIDER_AUTH_TOKEN into the env file
  --operator-token <t>   Write MIRROR_OPERATOR_TOKEN into the env file
  --base-url <url>       Write MIRROR_BASE_URL into the env file
  --port <n>             Write MIRROR_PORT into the env file (default: 7777)
  --node-id <id>         Write MIRROR_NODE_ID into the env file (default: hostname)
  --force                Rewrite the env file with installer defaults
  --enable               Run: systemctl --user enable mirror-runtime.service
  --start                Run: systemctl --user start mirror-runtime.service
  --skip-systemctl       Do not run systemctl commands during bootstrap
  --help                 Show this message
EOF
}

fail() {
  printf '[mirror-runtime-install] %s\n' "$*" >&2
  exit 1
}

require_writable_parent() {
  local target="$1"
  local parent
  parent="$(dirname "$target")"
  while [ "$parent" != "/" ] && [ ! -d "$parent" ]; do
    parent="$(dirname "$parent")"
  done
  if [ ! -w "$parent" ]; then
    fail "runtime root parent is not writable: ${parent}. Use --runtime-root under a writable path, or create ${target} with elevated privileges before rerunning."
  fi
}

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[&|]/\\&/g'
}

default_node_id() {
  if command -v hostname >/dev/null 2>&1; then
    hostname
    return
  fi
  printf 'mirror-node-local\n'
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="${SCRIPT_DIR}"
PAYLOAD_ROOT="${SOURCE_ROOT}/rootfs/opt/mirror-runtime"
SERVICE_TEMPLATE="${SOURCE_ROOT}/rootfs/usr/lib/systemd/user/mirror-runtime.service"

[ -d "${PAYLOAD_ROOT}" ] || fail "missing runtime payload under ${PAYLOAD_ROOT}"
[ -f "${SERVICE_TEMPLATE}" ] || fail "missing service template under ${SERVICE_TEMPLATE}"

HOME_DIR="${HOME:-}"
[ -n "${HOME_DIR}" ] || fail "HOME must be set"

RUNTIME_ROOT="/opt/mirror-runtime"
CONFIG_DIR="${HOME_DIR}/.config/mirror-runtime"
DATA_DIR="${HOME_DIR}/.local/share/mirror-runtime"
STATE_DIR="${HOME_DIR}/.local/state/mirror-runtime"
UNIT_DIR="${HOME_DIR}/.config/systemd/user"
LORE_DIR=""
MEMORY_DB_PATH=""
ENV_FILE=""
PROVIDER_URL="https://provider.example/v1/chat/completions"
PROVIDER_TOKEN="replace-me"
OPERATOR_TOKEN=""
BASE_URL=""
PORT="7777"
NODE_ID="$(default_node_id)"
FORCE_ENV="false"
ENABLE_SERVICE="false"
START_SERVICE="false"
SKIP_SYSTEMCTL="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --runtime-root)
      [ "$#" -ge 2 ] || fail "--runtime-root requires a value"
      RUNTIME_ROOT="$2"
      shift 2
      ;;
    --config-dir)
      [ "$#" -ge 2 ] || fail "--config-dir requires a value"
      CONFIG_DIR="$2"
      shift 2
      ;;
    --data-dir)
      [ "$#" -ge 2 ] || fail "--data-dir requires a value"
      DATA_DIR="$2"
      shift 2
      ;;
    --state-dir)
      [ "$#" -ge 2 ] || fail "--state-dir requires a value"
      STATE_DIR="$2"
      shift 2
      ;;
    --unit-dir)
      [ "$#" -ge 2 ] || fail "--unit-dir requires a value"
      UNIT_DIR="$2"
      shift 2
      ;;
    --provider-url)
      [ "$#" -ge 2 ] || fail "--provider-url requires a value"
      PROVIDER_URL="$2"
      shift 2
      ;;
    --provider-token)
      [ "$#" -ge 2 ] || fail "--provider-token requires a value"
      PROVIDER_TOKEN="$2"
      shift 2
      ;;
    --operator-token)
      [ "$#" -ge 2 ] || fail "--operator-token requires a value"
      OPERATOR_TOKEN="$2"
      shift 2
      ;;
    --base-url)
      [ "$#" -ge 2 ] || fail "--base-url requires a value"
      BASE_URL="$2"
      shift 2
      ;;
    --port)
      [ "$#" -ge 2 ] || fail "--port requires a value"
      PORT="$2"
      shift 2
      ;;
    --node-id)
      [ "$#" -ge 2 ] || fail "--node-id requires a value"
      NODE_ID="$2"
      shift 2
      ;;
    --force)
      FORCE_ENV="true"
      shift
      ;;
    --enable)
      ENABLE_SERVICE="true"
      shift
      ;;
    --start)
      START_SERVICE="true"
      shift
      ;;
    --skip-systemctl)
      SKIP_SYSTEMCTL="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

LORE_DIR="${DATA_DIR}/lore-scrolls"
MEMORY_DB_PATH="${STATE_DIR}/mirror-memory.db"
ENV_FILE="${CONFIG_DIR}/mirror-runtime.env"
WORKING_DIRECTORY="${DATA_DIR}"
UNIT_FILE="${UNIT_DIR}/mirror-runtime.service"

require_writable_parent "${RUNTIME_ROOT}"
mkdir -p "${RUNTIME_ROOT}" "${CONFIG_DIR}" "${DATA_DIR}" "${STATE_DIR}" "${LORE_DIR}" "${UNIT_DIR}"
tar -C "${PAYLOAD_ROOT}" -cf - . | tar -C "${RUNTIME_ROOT}" -xf -
chmod 755 "${RUNTIME_ROOT}/bin/mirror"

if [ "${FORCE_ENV}" = "true" ] || [ ! -f "${ENV_FILE}" ]; then
  cat > "${ENV_FILE}" <<EOF
# Mirror Runtime environment
# Generated by install-mirror-runtime.sh

MIRROR_PORT=${PORT}
MIRROR_NODE_ID=${NODE_ID}

# Required provider settings
MIRROR_PROVIDER_URL=${PROVIDER_URL}
MIRROR_PROVIDER_AUTH_TOKEN=${PROVIDER_TOKEN}

# Optional operator auth for write-capable commands
EOF
  if [ -n "${OPERATOR_TOKEN}" ]; then
    printf 'MIRROR_OPERATOR_TOKEN=%s\n' "${OPERATOR_TOKEN}" >> "${ENV_FILE}"
  else
    printf '# MIRROR_OPERATOR_TOKEN=replace-me\n' >> "${ENV_FILE}"
  fi
  cat >> "${ENV_FILE}" <<EOF

# Optional externally reachable base URL for sync/peer announcements
EOF
  if [ -n "${BASE_URL}" ]; then
    printf 'MIRROR_BASE_URL=%s\n' "${BASE_URL}" >> "${ENV_FILE}"
  else
    printf '# MIRROR_BASE_URL=https://mirror.example\n' >> "${ENV_FILE}"
  fi
  cat >> "${ENV_FILE}" <<EOF

# Linux-first directory conventions
MIRROR_LORE_DIR=${LORE_DIR}
MIRROR_MEMORY_DB_PATH=${MEMORY_DB_PATH}
EOF
fi

sed \
  -e "s|@ENV_FILE@|$(escape_sed_replacement "${ENV_FILE}")|g" \
  -e "s|@WORKING_DIRECTORY@|$(escape_sed_replacement "${WORKING_DIRECTORY}")|g" \
  -e "s|@RUNTIME_ROOT@|$(escape_sed_replacement "${RUNTIME_ROOT}")|g" \
  "${SERVICE_TEMPLATE}" > "${UNIT_FILE}"

if [ "${SKIP_SYSTEMCTL}" = "false" ] && command -v systemctl >/dev/null 2>&1; then
  if ! systemctl --user daemon-reload; then
    fail "systemctl --user daemon-reload failed. Start a real user systemd session, or rerun with --skip-systemctl and manage the user unit manually."
  fi
  if [ "${ENABLE_SERVICE}" = "true" ]; then
    if ! systemctl --user enable mirror-runtime.service; then
      fail "systemctl --user enable failed. Rerun with --skip-systemctl if this host session has no active user bus."
    fi
  fi
  if [ "${START_SERVICE}" = "true" ]; then
    if ! systemctl --user start mirror-runtime.service; then
      fail "systemctl --user start failed. Rerun with --skip-systemctl if this host session has no active user bus."
    fi
  fi
elif [ "${ENABLE_SERVICE}" = "true" ] || [ "${START_SERVICE}" = "true" ]; then
  fail "systemctl --user is unavailable; rerun with --skip-systemctl or from a user systemd session"
fi

cat <<EOF
Mirror Runtime installed

Runtime root: ${RUNTIME_ROOT}
Config dir:   ${CONFIG_DIR}
Data dir:     ${DATA_DIR}
State dir:    ${STATE_DIR}
Env file:     ${ENV_FILE}
User unit:    ${UNIT_FILE}

Edit provider settings if needed:
  ${ENV_FILE}

Next commands:
  ${RUNTIME_ROOT}/bin/mirror help
  systemctl --user daemon-reload
  systemctl --user enable mirror-runtime.service
  systemctl --user start mirror-runtime.service
  systemctl --user status mirror-runtime.service
  journalctl --user -u mirror-runtime -f
EOF
