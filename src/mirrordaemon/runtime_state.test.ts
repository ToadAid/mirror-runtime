import { describe, expect, it } from "vitest";
import { createMirrordaemon, getMirrordaemonActionsState } from "./index.js";

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
      actions: [
        {
          action_id: "action-finished",
          session_id: "session-finished",
          trace_id: "trace-finished",
        },
        {
          action_id: "action-failed",
          session_id: "session-failed",
          trace_id: "trace-failed",
        },
      ],
    });

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
});
