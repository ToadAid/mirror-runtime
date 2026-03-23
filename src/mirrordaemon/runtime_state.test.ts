import { describe, expect, it } from "vitest";
import {
  buildDebugSnapshot,
  buildHealthSummary,
  buildRuntimeSummary,
  createMirrordaemon,
  getMirrordaemonActionsState,
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

describe("mirrordaemon runtime state", () => {
  it("removes operator-visible active actions after finished or failed runtime events", () => {
    const daemon = createMirrordaemon({
      config: baseConfig,
      lifecycle: {
        discoveredLoreFiles: 2,
        shutdown: async () => undefined,
      },
      runtimeStartedAt: "2026-03-13T00:00:00.000Z",
    });

    daemon.publishRuntimeEvent("action.execution.started", {
      trace_id: "trace-finished",
      session_id: "session-finished",
      action_id: "action-finished",
      action: "mirror.find-scroll",
    });
    daemon.publishRuntimeEvent("action.execution.started", {
      trace_id: "trace-failed",
      session_id: "session-failed",
      action_id: "action-failed",
      action: "mirror.find-scroll",
    });

    expect(getMirrordaemonActionsState(daemon)).toMatchObject({
      active: 2,
    });
    expect(getMirrordaemonActionsState(daemon).actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action_id: "action-finished",
          session_id: "session-finished",
          trace_id: "trace-finished",
        }),
        expect.objectContaining({
          action_id: "action-failed",
          session_id: "session-failed",
          trace_id: "trace-failed",
        }),
      ]),
    );

    daemon.publishRuntimeEvent("action.execution.finished", {
      trace_id: "trace-finished",
      session_id: "session-finished",
      action_id: "action-finished",
      action: "mirror.find-scroll",
    });
    daemon.publishRuntimeEvent("action.execution.failed", {
      trace_id: "trace-failed",
      session_id: "session-failed",
      action_id: "action-failed",
      action: "mirror.find-scroll",
    });

    expect(getMirrordaemonActionsState(daemon)).toMatchObject({
      active: 0,
      actions: [],
    });
  });

  it("keeps incomplete action start events out of operator inspection", () => {
    const daemon = createMirrordaemon({
      config: baseConfig,
      lifecycle: {
        discoveredLoreFiles: 2,
        shutdown: async () => undefined,
      },
      runtimeStartedAt: "2026-03-13T00:00:00.000Z",
    });

    daemon.publishRuntimeEvent("action.execution.started", {
      session_id: "missing-trace",
      action_id: "action-missing-trace",
      action: "mirror.find-scroll",
    });
    daemon.publishRuntimeEvent("action.execution.started", {
      trace_id: "trace-missing-name",
      session_id: "missing-name",
      action_id: "action-missing-name",
    });
    daemon.publishRuntimeEvent("action.execution.started", {
      trace_id: "trace-complete",
      session_id: "session-complete",
      action_id: "action-complete",
      action: "mirror.find-scroll",
    });

    expect(getMirrordaemonActionsState(daemon)).toMatchObject({
      active: 1,
      actions: [
        {
          action_id: "action-complete",
          action_name: "mirror.find-scroll",
          session_id: "session-complete",
          trace_id: "trace-complete",
        },
      ],
    });
  });

  it("keeps websocket inspection truth aligned between runtime summary and debug snapshots", () => {
    const daemon = createMirrordaemon({
      config: baseConfig,
      lifecycle: {
        discoveredLoreFiles: 2,
        shutdown: async () => undefined,
      },
      runtimeStartedAt: "2026-03-13T00:00:00.000Z",
    });

    daemon.publishRuntimeEvent("runtime.ws.connected", {
      connection_id: "conn-1",
      path: "/mirror/runtime/ws",
    });
    daemon.publishRuntimeEvent("runtime.ws.disconnected", {
      connection_id: "conn-1",
      path: "/mirror/runtime/ws",
    });

    const runtime = buildRuntimeSummary(daemon, {
      port: 7788,
      baseUrl: "http://127.0.0.1:7788",
      wsConnections: 2,
      sseAvailable: true,
      wsAvailable: true,
    });
    const debug = buildDebugSnapshot(daemon, {
      port: 7788,
      baseUrl: "http://127.0.0.1:7788",
      wsConnections: 2,
      sseAvailable: true,
      wsAvailable: true,
    });

    expect(debug.runtime).toMatchObject({
      node_id: runtime.node_id,
      port: runtime.port,
      base_url: runtime.base_url,
      event_stream: runtime.event_stream,
    });
    expect(runtime.event_stream.ws_connections).toBe(2);
    expect(debug.runtime.event_stream.ws_connections).toBe(2);
    expect(runtime.event_stream.sse_available).toBe(true);
    expect(debug.runtime.event_stream.sse_available).toBe(true);
    expect(runtime.event_stream.ws_available).toBe(true);
    expect(debug.runtime.event_stream.ws_available).toBe(true);
    expect(runtime.event_stream.recent_events).toBe(debug.recent_events.length);
    expect(debug.runtime.event_stream.recent_events).toBe(debug.recent_events.length);
    expect(debug.recent_events.some((event) => event.type === "runtime.ws.connected")).toBe(true);
    expect(debug.recent_events.some((event) => event.type === "runtime.ws.disconnected")).toBe(
      true,
    );
  });

  it("preserves websocket event stream truth between runtime and health summaries", () => {
    const daemon = createMirrordaemon({
      config: baseConfig,
      lifecycle: {
        discoveredLoreFiles: 2,
        shutdown: async () => undefined,
      },
      runtimeStartedAt: "2026-03-13T00:00:00.000Z",
    });

    daemon.publishRuntimeEvent("runtime.ws.connected", {
      connection_id: "conn-1",
      path: "/mirror/runtime/ws",
    });
    daemon.publishRuntimeEvent("runtime.ws.disconnected", {
      connection_id: "conn-1",
      path: "/mirror/runtime/ws",
    });

    const runtime = buildRuntimeSummary(daemon, {
      port: 7788,
      baseUrl: "http://127.0.0.1:7788",
      wsConnections: 3,
      sseAvailable: true,
      wsAvailable: true,
    });
    const health = buildHealthSummary(daemon, {
      port: 7788,
      baseUrl: "http://127.0.0.1:7788",
      wsConnections: 3,
      sseAvailable: true,
      wsAvailable: true,
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

    expect(health.event_stream).toEqual(runtime.event_stream);
    expect(health.event_stream.ws_connections).toBe(3);
    expect(health.event_stream.sse_available).toBe(true);
    expect(health.event_stream.ws_available).toBe(true);
    expect(health.event_stream.recent_events).toBe(daemon.getRecentEvents().length);
    expect(health.sync.peers_known).toBe(2);
  });
});
