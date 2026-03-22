import { spawnSync } from "node:child_process";

const steps = [
  [
    "pnpm",
    [
      "vitest",
      "run",
      "src/mirrordaemon/mirrordaemon.test.ts",
      "src/mirrordaemon/runtime_state.test.ts",
      "src/compat/openclaw/shim-boundary.test.ts",
      "src/runtime/compat-legacy-boundary.test.ts",
    ],
  ],
  [
    "pnpm",
    [
      "vitest",
      "run",
      "src/mirror-service/mirror_service.test.ts",
      "-t",
      [
        "exposes canonical runtime state and debug endpoints",
        "emits daemon runtime events for chat, tool, provider, and sync lifecycle",
        "streams /mirror/runtime/ws with backlog, live events, and protocol messages",
        "surfaces runtime websocket connect and disconnect events to live subscribers",
        "replays prior websocket transport events from backlog to reconnecting subscribers",
        "replays backlog only when explicitly requested by subscribe control messages",
        "returns websocket error envelopes for unsupported control messages",
        "returns websocket error envelopes for invalid control payloads",
        "reflects websocket connection counts on the runtime summary as sockets connect and disconnect",
        "keeps service, console, daemon, observability, and status surfaces in sync",
      ].join("|"),
    ],
  ],
  [
    "pnpm",
    [
      "vitest",
      "run",
      "src/mirror-cli/mirror_cli.test.ts",
      "-t",
      [
        "supports standalone status and verify-lore commands",
        "uses MIRROR_LORE_DIR defaults for verify-lore against the current lore root",
        "supports sync commands in human-readable mode",
        "returns stable JSON shapes for sync commands",
        "reports CLI status from the same daemon-backed runtime truth after command execution",
        "keeps mirror status limited to canonical runtime truth after sync announce",
      ].join("|"),
    ],
  ],
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
