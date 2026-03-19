import type { Mirrordaemon } from "./mirrordaemon.js";
import { buildDebugSnapshot } from "./runtime_state.js";

export function getMirrordaemonDebugState(
  daemon: Mirrordaemon,
  params: {
    port?: number;
    baseUrl?: string | null;
    peersKnown?: number;
    connectorRuntime?: {
      telegram?: import("./daemon_types.js").MirrordaemonConnectorRuntimeStatus;
    };
  } = {},
) {
  return buildDebugSnapshot(daemon, params);
}
