import { afterEach, describe, expect, it, vi } from "vitest";
import { createInlineCodeState } from "../markdown/code-spans.js";
import { makeErrorSignature } from "../mirror/mistake_ledger/repeat_detector.js";
import type { LedgerEventRow } from "../mirror/mistake_ledger/types.js";
import { handleAgentEnd } from "./pi-embedded-subscribe.handlers.lifecycle.js";
import { handleToolExecutionEnd } from "./pi-embedded-subscribe.handlers.tools.js";
import type {
  EmbeddedPiSubscribeContext,
  ToolHandlerContext,
} from "./pi-embedded-subscribe.handlers.types.js";

const { mockRecordMistake, mockInitLedgerOnce, mockQuery } = vi.hoisted(() => ({
  mockRecordMistake: vi.fn(),
  mockInitLedgerOnce: vi.fn(),
  mockQuery: vi.fn<() => LedgerEventRow[]>(),
}));

vi.mock("../infra/agent-events.js", () => ({
  emitAgentEvent: vi.fn(),
}));

vi.mock("../mirror/ledger/accessor.js", () => ({
  initLedgerOnce: mockInitLedgerOnce,
  recordMistake: mockRecordMistake,
}));

vi.mock("../mirror/mistake_ledger/ledger.js", () => ({
  getLedger: () => ({ query: mockQuery }),
}));

vi.mock("../mirror/lore_forge_hook.js", () => ({
  maybeForgeLoreCandidate: vi.fn(),
}));

type MirrorHint = {
  type: "mirror_hint";
  ts: number;
  runId?: string;
  toolName: string;
  signature: string;
  repeats: number;
  hint: string;
};

function createRow(signature: string): LedgerEventRow {
  return {
    id: crypto.randomUUID(),
    ts: Date.now(),
    kind: "mistake",
    run_id: "run-repeat",
    tool_name: "exec",
    agent_id: null,
    user_id: null,
    session_id: null,
    severity: "warn",
    title: "tool_error",
    detail_json: JSON.stringify({ signature }),
    tags_json: null,
    source: "system",
    related_id: null,
    hash: "h",
  };
}

function createToolContext(onAgentEvent: (event: unknown) => void): ToolHandlerContext {
  return {
    params: {
      runId: "run-repeat",
      onBlockReplyFlush: undefined,
      onAgentEvent,
      onToolResult: undefined,
    },
    state: {
      toolMetaById: new Map(),
      toolMetas: [],
      toolSummaryById: new Set(),
      pendingMessagingTargets: new Map(),
      pendingMessagingTexts: new Map(),
      pendingMessagingMediaUrls: new Map(),
      messagingToolSentTexts: [],
      messagingToolSentTextsNormalized: [],
      messagingToolSentMediaUrls: [],
      messagingToolSentTargets: [],
      successfulCronAdds: 0,
    },
    log: {
      debug: vi.fn(),
      warn: vi.fn(),
    },
    flushBlockReplyBuffer: vi.fn(),
    shouldEmitToolResult: () => false,
    shouldEmitToolOutput: () => false,
    emitToolSummary: vi.fn(),
    emitToolOutput: vi.fn(),
    trimMessagingToolSent: vi.fn(),
  };
}

function createLifecycleContext(
  onAgentEvent: (event: unknown) => void,
): EmbeddedPiSubscribeContext {
  return {
    params: {
      runId: "run-1",
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

describe("mirror hint compatibility", () => {
  const originalEnabled = process.env.MIRROR_LEDGER_ENABLED;
  const originalHintsEnabled = process.env.MIRROR_HINTS_ENABLED;

  afterEach(() => {
    if (originalEnabled === undefined) {
      delete process.env.MIRROR_LEDGER_ENABLED;
    } else {
      process.env.MIRROR_LEDGER_ENABLED = originalEnabled;
    }
    if (originalHintsEnabled === undefined) {
      delete process.env.MIRROR_HINTS_ENABLED;
    } else {
      process.env.MIRROR_HINTS_ENABLED = originalHintsEnabled;
    }
  });

  it("emits immediate mirror_hint on repeated tool_error and queues hint", async () => {
    process.env.MIRROR_LEDGER_ENABLED = "1";
    const signature = makeErrorSignature({ toolName: "exec", error: "Repeated failure" });
    mockQuery.mockReturnValue([createRow(signature), createRow(signature), createRow(signature)]);

    const onAgentEvent = vi.fn();
    const ctx = createToolContext(onAgentEvent);

    await handleToolExecutionEnd(ctx, {
      type: "tool_execution_end",
      toolName: "exec",
      toolCallId: "tool-1",
      isError: true,
      result: { error: "Repeated failure" },
    });

    const stateWithHints = ctx.state as ToolHandlerContext["state"] & {
      mirrorHints?: MirrorHint[];
    };

    expect(stateWithHints.mirrorHints?.length).toBe(1);
    expect(onAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "mirror_hint", toolName: "exec", repeats: 3 }),
    );
  });

  it("emits mirror_hints once at run end and drains hints", () => {
    process.env.MIRROR_LEDGER_ENABLED = "1";
    delete process.env.MIRROR_HINTS_ENABLED;
    const onAgentEvent = vi.fn();
    const ctx = createLifecycleContext(onAgentEvent);
    const stateWithHints = ctx.state as EmbeddedPiSubscribeContext["state"] & {
      mirrorHints?: MirrorHint[];
    };
    stateWithHints.mirrorHints = [
      {
        type: "mirror_hint",
        ts: Date.now(),
        runId: "run-1",
        toolName: "exec",
        signature: "tool:exec|err:test",
        repeats: 3,
        hint: "Repeated tool_error detected; consider changing strategy or inputs.",
      },
    ];

    handleAgentEnd(ctx);

    const hintCalls = onAgentEvent.mock.calls.filter((call) => call[0]?.stream === "mirror_hints");
    expect(hintCalls).toHaveLength(1);
    expect(hintCalls[0]?.[0]).toMatchObject({
      stream: "mirror_hints",
      data: {
        runId: "run-1",
      },
    });
    const nudgeCalls = onAgentEvent.mock.calls.filter((call) => call[0]?.stream === "mirror_nudge");
    expect(nudgeCalls).toHaveLength(0);
    expect(stateWithHints.mirrorHints).toEqual([]);
  });

  it("emits mirror_nudge only when MIRROR_HINTS_ENABLED=1", () => {
    process.env.MIRROR_LEDGER_ENABLED = "1";
    process.env.MIRROR_HINTS_ENABLED = "1";
    const onAgentEvent = vi.fn();
    const ctx = createLifecycleContext(onAgentEvent);
    const stateWithHints = ctx.state as EmbeddedPiSubscribeContext["state"] & {
      mirrorHints?: MirrorHint[];
    };
    stateWithHints.mirrorHints = [
      {
        type: "mirror_hint",
        ts: Date.now(),
        runId: "run-1",
        toolName: "exec",
        signature: "tool:exec|err:test",
        repeats: 5,
        hint: "Repeated tool_error detected; consider changing strategy or inputs.",
      },
    ];

    handleAgentEnd(ctx);

    const nudgeCalls = onAgentEvent.mock.calls.filter((call) => call[0]?.stream === "mirror_nudge");
    expect(nudgeCalls).toHaveLength(1);
    expect(nudgeCalls[0]?.[0]).toMatchObject({
      stream: "mirror_nudge",
      data: {
        runId: "run-1",
      },
    });
  });

  it("does not emit mirror_hints when hints are missing or empty", () => {
    process.env.MIRROR_LEDGER_ENABLED = "1";
    const onAgentEvent = vi.fn();
    const ctx = createLifecycleContext(onAgentEvent);
    const stateWithHints = ctx.state as EmbeddedPiSubscribeContext["state"] & {
      mirrorHints?: MirrorHint[];
    };
    stateWithHints.mirrorHints = [];

    handleAgentEnd(ctx);

    const hintCalls = onAgentEvent.mock.calls.filter((call) => call[0]?.stream === "mirror_hints");
    expect(hintCalls).toHaveLength(0);
  });
});
