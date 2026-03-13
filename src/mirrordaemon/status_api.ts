import type { Mirrordaemon } from "./mirrordaemon.js";
import { buildHealthSummary, buildRuntimeSummary } from "./runtime_state.js";

export function getMirrordaemonRuntimeState(
  daemon: Mirrordaemon,
  params: { port?: number; baseUrl?: string | null } = {},
) {
  return buildRuntimeSummary(daemon, params);
}

export function getMirrordaemonHealthState(
  daemon: Mirrordaemon,
  params: { port?: number; baseUrl?: string | null; peersKnown?: number } = {},
) {
  return buildHealthSummary(daemon, params);
}
