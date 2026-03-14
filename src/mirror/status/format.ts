import type { MirrorStatus } from "./status.js";

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

export function formatMirrorStatusHuman(status: MirrorStatus): string {
  const lines = [
    "🪞 Mirror Runtime",
    `ts: ${status.ts}`,
    `cwd: ${status.cwd}`,
    "runtime:",
    `- nodeId: ${status.runtime.node_id}`,
    `- startedAt: ${status.runtime.runtime_started_at}`,
    `- port: ${status.runtime.port}`,
    `- baseUrl: ${status.runtime.base_url ?? "-"}`,
    `- surfaces: ${status.runtime.surfaces.join(", ")}`,
    `- sessionsOpen: ${status.runtime.sessions.open}`,
    `- sessionsTotal: ${status.runtime.sessions.total}`,
    "service:",
    `- loreDir: ${status.service.lore_dir}`,
    `- providerUrl: ${status.service.provider_url || "-"}`,
    `- operatorAuthConfigured: ${yesNo(status.service.operator_auth_configured)}`,
    `- workspaceUsersRoot: ${status.service.workspace_users_root}`,
    "provider:",
    `- configured: ${yesNo(status.provider.configured)}`,
    `- ready: ${yesNo(status.provider.ready)}`,
    `- activeProviderId: ${status.provider.active_provider_id ?? "-"}`,
    `- total: ${status.provider.total}`,
    `- available: ${status.provider.available}`,
    `- fallbackAvailable: ${yesNo(status.provider.fallback_available)}`,
    `- providers: ${status.provider.providers.map((provider) => `${provider.provider_id}${provider.selected ? "*" : ""}`).join(", ") || "-"}`,
    "lore:",
    `- ready: ${yesNo(status.lore.ready)}`,
    `- discoveredFiles: ${status.lore.discovered_files}`,
    "workspace:",
    `- ready: ${yesNo(status.workspace.ready)}`,
    `- usersRoot: ${status.workspace.users_root}`,
    "sync:",
    `- nodeId: ${status.sync.node_id}`,
    `- baseUrl: ${status.sync.base_url ?? "-"}`,
    `- peersKnown: ${status.sync.peers_known}`,
    "observability:",
    `- diagnosticsEvents: ${status.observability.diagnostics_events}`,
    `- chatRequests: ${status.observability.metrics.counters.chat_requests}`,
    `- toolExecutions: ${status.observability.metrics.counters.tool_executions}`,
    "",
  ];

  return `${lines.join("\n")}\n`;
}
