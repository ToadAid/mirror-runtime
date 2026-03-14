import type { Mirrordaemon } from "./mirrordaemon.js";
import {
  buildActionsSummary,
  buildHealthSummary,
  buildProvidersSummary,
  buildRuntimeSummary,
} from "./runtime_state.js";

export function getMirrordaemonRuntimeState(
  daemon: Mirrordaemon,
  params: Parameters<typeof buildRuntimeSummary>[1] = {},
) {
  return buildRuntimeSummary(daemon, params);
}

export function getMirrordaemonHealthState(
  daemon: Mirrordaemon,
  params: Parameters<typeof buildHealthSummary>[1] = {},
) {
  return buildHealthSummary(daemon, params);
}

export function getMirrordaemonActionsState(
  daemon: Mirrordaemon,
  params: Parameters<typeof buildActionsSummary>[1] = {},
) {
  return buildActionsSummary(daemon, params);
}

export function getMirrordaemonProvidersState(
  daemon: Mirrordaemon,
  params: Parameters<typeof buildProvidersSummary>[1] = {},
) {
  return buildProvidersSummary(daemon, params);
}
