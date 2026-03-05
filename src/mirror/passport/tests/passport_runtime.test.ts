import { afterEach, describe, expect, it, vi } from "vitest";
import { handleAgentEnd } from "../../../agents/pi-embedded-subscribe.handlers.lifecycle.js";
import type { EmbeddedPiSubscribeContext } from "../../../agents/pi-embedded-subscribe.handlers.types.js";
import { createInlineCodeState } from "../../../markdown/code-spans.js";

vi.mock("../../../infra/agent-events.js", () => ({
  emitAgentEvent: vi.fn(),
}));

function createLifecycleContext(
  onAgentEvent: (event: unknown) => void,
  overrides?: { stateAgentId?: string },
): EmbeddedPiSubscribeContext {
  return {
    params: {
      runId: "run-passport",
      config: {},
      sessionKey: "agent:main:main",
      onAgentEvent,
    },
    state: {
      lastAssistant: undefined,
      pendingCompactionRetry: 0,
      blockState: {
        thinking: true,
        final: true,
        inlineCode: createInlineCodeState(),
      },
      ...(overrides?.stateAgentId ? { agentId: overrides.stateAgentId } : {}),
    },
    log: {
      debug: vi.fn(),
      warn: vi.fn(),
    },
    flushBlockReplyBuffer: vi.fn(),
    resolveCompactionRetry: vi.fn(),
    maybeResolveCompactionWait: vi.fn(),
  } as unknown as EmbeddedPiSubscribeContext;
}

describe("mirror passport runtime telemetry", () => {
  const originalTelemetryEnabled = process.env.MIRROR_TELEMETRY_ENABLED;
  const originalPassportEnabled = process.env.MIRROR_PASSPORT_TELEMETRY_ENABLED;
  const originalSinkEnabled = process.env.MIRROR_TELEMETRY_SINK_ENABLED;

  afterEach(() => {
    if (originalTelemetryEnabled === undefined) {
      delete process.env.MIRROR_TELEMETRY_ENABLED;
    } else {
      process.env.MIRROR_TELEMETRY_ENABLED = originalTelemetryEnabled;
    }
    if (originalPassportEnabled === undefined) {
      delete process.env.MIRROR_PASSPORT_TELEMETRY_ENABLED;
    } else {
      process.env.MIRROR_PASSPORT_TELEMETRY_ENABLED = originalPassportEnabled;
    }
    if (originalSinkEnabled === undefined) {
      delete process.env.MIRROR_TELEMETRY_SINK_ENABLED;
    } else {
      process.env.MIRROR_TELEMETRY_SINK_ENABLED = originalSinkEnabled;
    }
  });

  it("emits mirror.passport telemetry when enabled", () => {
    process.env.MIRROR_TELEMETRY_ENABLED = "1";
    process.env.MIRROR_PASSPORT_TELEMETRY_ENABLED = "1";
    process.env.MIRROR_TELEMETRY_SINK_ENABLED = "1";

    const onAgentEvent = vi.fn();
    const ctx = createLifecycleContext(onAgentEvent, { stateAgentId: "agent-main" });

    handleAgentEnd(ctx);

    const telemetryCalls = onAgentEvent.mock.calls.filter(
      (call) =>
        call[0] &&
        typeof call[0] === "object" &&
        (call[0] as { stream?: string }).stream === "telemetry",
    );

    expect(telemetryCalls).toHaveLength(1);
    const event = telemetryCalls[0]?.[0] as {
      stream: string;
      data: Record<string, unknown>;
    };
    expect(event.stream).toBe("telemetry");
    expect(event.data.type).toBe("mirror.passport");
    expect(event.data.runId).toBe("run-passport");
    expect(event.data.agentId).toBe("agent-main");
    expect(typeof event.data.ts).toBe("number");
    expect(event.data.telemetry).toMatchObject({ sinkEnabled: true });
  });

  it("does not leak local-only identity", () => {
    process.env.MIRROR_TELEMETRY_ENABLED = "1";
    process.env.MIRROR_PASSPORT_TELEMETRY_ENABLED = "1";

    const onAgentEvent = vi.fn();
    const ctx = createLifecycleContext(onAgentEvent, { stateAgentId: "agent-main" });
    (
      ctx.state as EmbeddedPiSubscribeContext["state"] & {
        travelerName?: string;
        humanName?: string;
        localIdentity?: string;
      }
    ).travelerName = "Tommy";

    handleAgentEnd(ctx);

    const telemetryCalls = onAgentEvent.mock.calls.filter(
      (call) =>
        call[0] &&
        typeof call[0] === "object" &&
        (call[0] as { stream?: string }).stream === "telemetry",
    );
    expect(telemetryCalls).toHaveLength(1);

    const firstCall = telemetryCalls[0];
    if (!firstCall) {
      throw new Error("expected telemetry call");
    }
    const data = (firstCall[0] as { data: Record<string, unknown> }).data;
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("travelerName");
    expect(serialized).not.toContain("humanName");
    expect(serialized).not.toContain("localIdentity");
    expect(serialized).not.toContain("name");
  });
});
