import { describe, expect, it } from "vitest";
import {
  createBootSnapshot,
  createMirrordaemon,
  createRuntimeEventStream,
  createSessionRegistry,
  getMirrordaemonDebugState,
  getMirrordaemonHealthState,
  getMirrordaemonRuntimeState,
} from "./index.js";

const baseConfig = {
  port: 7777,
  providerUrl: "http://brain.local/v1/chat/completions",
  providerAuthToken: "token",
  operatorToken: "secret",
  loreDir: "/tmp/mirror-lore",
  nodeId: "daemon-node",
  baseUrl: "http://127.0.0.1:7777",
};

describe("mirrordaemon", () => {
  it("creates a boot snapshot", () => {
    const snapshot = createBootSnapshot({
      config: baseConfig,
      lifecycle: {
        discoveredLoreFiles: 3,
        shutdown: async () => undefined,
      },
      runtimeStartedAt: "2026-03-13T00:00:00.000Z",
      daemonSessionId: "daemon-session-1",
    });

    expect(snapshot.runtime_started_at).toBe("2026-03-13T00:00:00.000Z");
    expect(snapshot.config.node_id).toBe("daemon-node");
    expect(snapshot.readiness.lore.discovered_files).toBe(3);
    expect(snapshot.readiness.provider.ready).toBe(true);
  });

  it("tracks sessions through the registry", () => {
    const registry = createSessionRegistry();
    const session = registry.createSession({
      session_id: "session-1",
      user_id: "alice",
      metadata: { path: "/mirror/chat" },
      now: "2026-03-13T00:00:00.000Z",
    });

    expect(registry.getSession("session-1")).toEqual(session);
    const touched = registry.touchSession("session-1", {
      now: "2026-03-13T00:05:00.000Z",
      metadata: { method: "POST" },
    });
    expect(touched?.last_activity_at).toBe("2026-03-13T00:05:00.000Z");
    expect(touched?.metadata.method).toBe("POST");
    expect(registry.listSessions()).toHaveLength(1);
    expect(registry.closeSession("session-1")?.status).toBe("closed");
  });

  it("publishes and subscribes to runtime events", () => {
    const stream = createRuntimeEventStream();
    const seen: string[] = [];
    const subscription = stream.subscribeRuntimeEvents((event) => {
      seen.push(event.type);
    });

    stream.publishRuntimeEvent("runtime.started", { node_id: "daemon-node" });
    stream.publishRuntimeEvent("session.created", { session_id: "session-1" });
    subscription.unsubscribe();
    stream.publishRuntimeEvent("session.closed", { session_id: "session-1" });

    expect(seen).toEqual(["runtime.started", "session.created"]);
    expect(stream.getRecentEvents()).toHaveLength(3);
  });

  it("builds canonical runtime, health, and debug summaries", () => {
    const daemon = createMirrordaemon({
      config: baseConfig,
      lifecycle: {
        discoveredLoreFiles: 2,
        shutdown: async () => undefined,
      },
      runtimeStartedAt: "2026-03-13T00:00:00.000Z",
    });
    daemon.createSession({ session_id: "session-1", user_id: "alice" });

    const runtime = getMirrordaemonRuntimeState(daemon, {
      port: 7788,
      baseUrl: "http://127.0.0.1:7788",
    });
    const health = getMirrordaemonHealthState(daemon, {
      port: 7788,
      baseUrl: "http://127.0.0.1:7788",
      peers: [
        {
          peer_id: "peer-1",
          base_url: "http://127.0.0.1:7999",
          last_seen_at: "2026-03-13T00:01:00.000Z",
          sync_status: "idle",
        },
        {
          peer_id: "peer-2",
          base_url: "http://127.0.0.1:8000",
          last_seen_at: "2026-03-13T00:02:00.000Z",
          sync_status: "ok",
        },
      ],
    });
    const debug = getMirrordaemonDebugState(daemon, {
      port: 7788,
      baseUrl: "http://127.0.0.1:7788",
    });

    expect(runtime.node_id).toBe("daemon-node");
    expect(runtime.sessions.open).toBe(1);
    expect(health.sync.peers_known).toBe(2);
    expect(debug.boot_snapshot.config.provider_url).toBe(baseConfig.providerUrl);
    expect(debug.sessions[0]?.session_id).toBe("session-1");
    expect(debug.recent_events.some((event) => event.type === "session.created")).toBe(true);
  });
});
