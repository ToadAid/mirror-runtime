#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${TMPDIR:-/tmp}/openclaw-mirror-local"
PID_TRACK_FILE="$ROOT_DIR/.mirror-local.pids"
DAEMON_LOG_FILE="$RUNTIME_DIR/mirror-daemon.log"
GATEWAY_LOG_FILE="$RUNTIME_DIR/gateway.log"
DAEMON_RUNTIME_PID_PATH="$RUNTIME_DIR/mirror-daemon.runtime.pid"
ENV_FILE="$ROOT_DIR/.env.mirror"
SERVICE_FILE="$HOME/.config/systemd/user/openclaw-gateway.service"

mkdir -p "$RUNTIME_DIR"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

resolve_gateway_token() {
  if [[ -n "${MIRROR_BRAIN_AUTH_TOKEN:-}" ]]; then
    printf '%s\n' "$MIRROR_BRAIN_AUTH_TOKEN"
    return
  fi

  if [[ -f "$SERVICE_FILE" ]]; then
    local token
    token="$(sed -n 's/^Environment=OPENCLAW_GATEWAY_TOKEN=//p' "$SERVICE_FILE")"
    if [[ -n "$token" ]]; then
      printf '%s\n' "$token"
      return
    fi
  fi

  return 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

start_process() {
  local log_file="$1"
  shift 1
  nohup "$@" >"$log_file" 2>&1 &
  local pid=$!
  sleep 1
  if ! is_pid_running "$pid"; then
    printf 'Process failed to start. See %s\n' "$log_file" >&2
    exit 1
  fi
  printf '%s\n' "$pid"
}

require_cmd pnpm
if [[ -f "$PID_TRACK_FILE" ]]; then
  tracked_daemon_pid="$(sed -n 's/^mirror_daemon_pid=//p' "$PID_TRACK_FILE")"
  tracked_gateway_pid="$(sed -n 's/^gateway_pid=//p' "$PID_TRACK_FILE")"
  if is_pid_running "${tracked_daemon_pid:-}" || is_pid_running "${tracked_gateway_pid:-}"; then
    printf 'Mirror local stack already running. Stop it first with ./scripts/stop-mirror-local.sh\n'
    exit 0
  fi
fi

export MIRROR_LORE_DIR="${MIRROR_LORE_DIR:-$HOME/mirror-v4/lore-scrolls}"
export MIRROR_DAEMON_TOKEN="${MIRROR_DAEMON_TOKEN:-local-secret}"
export MIRROR_RUNTIME_TOKEN="${MIRROR_RUNTIME_TOKEN:-$MIRROR_DAEMON_TOKEN}"
export MIRROR_RUNTIME_BASE_URL="${MIRROR_RUNTIME_BASE_URL:-http://127.0.0.1:8787}"
export MIRROR_BRAIN_URL="${MIRROR_BRAIN_URL:-http://127.0.0.1:18789/v1/chat/completions}"
export MIRROR_PROVIDER_MODEL="${MIRROR_PROVIDER_MODEL:-openai-codex/gpt-5.2}"
export MIRROR_RUNTIME_TIMEOUT_MS="${MIRROR_RUNTIME_TIMEOUT_MS:-20000}"
export MIRROR_BRAIN_AUTH_TOKEN="${MIRROR_BRAIN_AUTH_TOKEN:-$(resolve_gateway_token)}"
export MIRROR_RUNTIME_ENABLED=1
export MIRROR_DAEMON_BACKEND_DEBUG="${MIRROR_DAEMON_BACKEND_DEBUG:-1}"
export MIRROR_DAEMON_PID_PATH="$DAEMON_RUNTIME_PID_PATH"

if [[ ! -d "$MIRROR_LORE_DIR" ]]; then
  printf 'Lore directory not found: %s\n' "$MIRROR_LORE_DIR" >&2
  exit 1
fi

if [[ -z "$MIRROR_BRAIN_AUTH_TOKEN" ]]; then
  printf 'Unable to resolve MIRROR_BRAIN_AUTH_TOKEN from %s\n' "$SERVICE_FILE" >&2
  exit 1
fi

(
  cd "$ROOT_DIR"
  pnpm openclaw config set gateway.http.endpoints.chatCompletions.enabled true >/dev/null
)

daemon_pid="$(start_process \
  "$DAEMON_LOG_FILE" \
  env \
  MIRROR_LORE_DIR="$MIRROR_LORE_DIR" \
  MIRROR_DAEMON_TOKEN="$MIRROR_DAEMON_TOKEN" \
  MIRROR_BRAIN_URL="$MIRROR_BRAIN_URL" \
  MIRROR_BRAIN_AUTH_TOKEN="$MIRROR_BRAIN_AUTH_TOKEN" \
  MIRROR_PROVIDER_MODEL="$MIRROR_PROVIDER_MODEL" \
  MIRROR_DAEMON_PID_PATH="$MIRROR_DAEMON_PID_PATH" \
  pnpm --dir "$ROOT_DIR" openclaw mirror-daemon run --host 127.0.0.1 --port 8787)"

sleep 2

gateway_pid="$(start_process \
  "$GATEWAY_LOG_FILE" \
  env \
  MIRROR_RUNTIME_ENABLED="$MIRROR_RUNTIME_ENABLED" \
  MIRROR_RUNTIME_BASE_URL="$MIRROR_RUNTIME_BASE_URL" \
  MIRROR_RUNTIME_TOKEN="$MIRROR_RUNTIME_TOKEN" \
  MIRROR_RUNTIME_TIMEOUT_MS="$MIRROR_RUNTIME_TIMEOUT_MS" \
  MIRROR_DAEMON_BACKEND_DEBUG="$MIRROR_DAEMON_BACKEND_DEBUG" \
  pnpm --dir "$ROOT_DIR" openclaw gateway)"

cat >"$PID_TRACK_FILE" <<EOF
mirror_daemon_pid=$daemon_pid
gateway_pid=$gateway_pid
daemon_log=$DAEMON_LOG_FILE
gateway_log=$GATEWAY_LOG_FILE
EOF

printf 'Mirror local stack started.\n'
printf 'MirrorDaemon pid: %s\n' "$daemon_pid"
printf 'Gateway pid: %s\n' "$gateway_pid"
printf 'MirrorDaemon log: %s\n' "$DAEMON_LOG_FILE"
printf 'Gateway log: %s\n' "$GATEWAY_LOG_FILE"
