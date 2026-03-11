#!/usr/bin/env bash
set -euo pipefail

RUNTIME_DIR="${TMPDIR:-/tmp}/openclaw-mirror-local"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_TRACK_FILE="$ROOT_DIR/.mirror-local.pids"
DAEMON_RUNTIME_PID_PATH="$RUNTIME_DIR/mirror-daemon.runtime.pid"

stop_pid() {
  local pid="$1"
  local name="$2"
  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    printf '%s already stopped.\n' "$name"
    return
  fi

  kill "$pid" 2>/dev/null || true
  for _ in {1..20}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
  printf 'Stopped %s (pid=%s)\n' "$name" "$pid"
}

if [[ ! -f "$PID_TRACK_FILE" ]]; then
  printf 'No .mirror-local.pids file found. Nothing to stop.\n'
  exit 0
fi

daemon_pid="$(sed -n 's/^mirror_daemon_pid=//p' "$PID_TRACK_FILE")"
gateway_pid="$(sed -n 's/^gateway_pid=//p' "$PID_TRACK_FILE")"

stop_pid "$gateway_pid" "gateway"
stop_pid "$daemon_pid" "mirror-daemon"
rm -f "$PID_TRACK_FILE"
rm -f "$DAEMON_RUNTIME_PID_PATH"
