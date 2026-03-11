#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.mirror.direct"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

require_var() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    printf 'Missing required env: %s\n' "$name" >&2
    exit 1
  fi
}

export MIRROR_LORE_DIR="${MIRROR_LORE_DIR:-$HOME/mirror-v4/lore-scrolls}"
export MIRROR_DAEMON_TOKEN="${MIRROR_DAEMON_TOKEN:-local-secret}"
export MIRROR_PROVIDER_MODE="${MIRROR_PROVIDER_MODE:-direct}"
export MIRROR_PROVIDER_KIND="${MIRROR_PROVIDER_KIND:-openai_compat}"
export MIRROR_PROVIDER_CHAT_PATH="${MIRROR_PROVIDER_CHAT_PATH:-/v1/chat/completions}"
export MIRROR_PROVIDER_TIMEOUT_MS="${MIRROR_PROVIDER_TIMEOUT_MS:-90000}"

if [[ ! -d "$MIRROR_LORE_DIR" ]]; then
  printf 'Lore directory not found: %s\n' "$MIRROR_LORE_DIR" >&2
  exit 1
fi

if [[ "$MIRROR_PROVIDER_MODE" != "direct" ]]; then
  printf 'MIRROR_PROVIDER_MODE must be "direct" for this helper.\n' >&2
  exit 1
fi

if [[ "$MIRROR_PROVIDER_KIND" != "openai_compat" ]]; then
  printf 'MIRROR_PROVIDER_KIND must be "openai_compat" for this helper.\n' >&2
  exit 1
fi

require_var MIRROR_PROVIDER_BASE_URL
require_var MIRROR_PROVIDER_API_KEY
require_var MIRROR_PROVIDER_MODEL

printf 'Starting MirrorDaemon in direct mode.\n'
printf 'Lore dir: %s\n' "$MIRROR_LORE_DIR"
printf 'Provider: %s\n' "$MIRROR_PROVIDER_KIND"
printf 'Endpoint: %s%s\n' "$MIRROR_PROVIDER_BASE_URL" "$MIRROR_PROVIDER_CHAT_PATH"
printf 'Model: %s\n' "$MIRROR_PROVIDER_MODEL"

exec pnpm --dir "$ROOT_DIR" openclaw mirror-daemon run --host 127.0.0.1 --port 8787
