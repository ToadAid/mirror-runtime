import type { Mirrordaemon } from "./mirrordaemon.js";
import { buildDebugSnapshot } from "./runtime_state.js";

export function getMirrordaemonDebugState(
  daemon: Mirrordaemon,
  params: { port?: number; baseUrl?: string | null; peersKnown?: number } = {},
) {
  return buildDebugSnapshot(daemon, params);
}
