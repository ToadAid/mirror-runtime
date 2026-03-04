import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeErrorSignature } from "../mirror/mistake_ledger/repeat_detector.js";
import type { LedgerEventRow } from "../mirror/mistake_ledger/types.js";

const { mockRecordMistake, mockInitLedgerOnce, mockQuery } = vi.hoisted(() => ({
  mockRecordMistake: vi.fn(),
  mockInitLedgerOnce: vi.fn(),
  mockQuery: vi.fn<() => LedgerEventRow[]>(),
}));

vi.mock("../mirror/ledger/accessor.js", () => ({
  initLedgerOnce: mockInitLedgerOnce,
  recordMistake: mockRecordMistake,
}));

vi.mock("../mirror/mistake_ledger/ledger.js", () => ({
  getLedger: () => ({
    query: mockQuery,
  }),
}));

vi.mock("../mirror/lore_forge_hook.js", () => ({
  maybeForgeLoreCandidate: vi.fn(),
}));

import { handleToolExecutionEnd } from "./pi-embedded-subscribe.handlers.tools.js";
import type { ToolHandlerContext } from "./pi-embedded-subscribe.handlers.types.js";

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

describe("mirror hint queue", () => {
  const originalEnabled = process.env.MIRROR_LEDGER_ENABLED;

  beforeEach(() => {
    process.env.MIRROR_LEDGER_ENABLED = "1";
    mockRecordMistake.mockReset();
    mockInitLedgerOnce.mockReset();
    mockQuery.mockReset();
  });

  afterEach(() => {
    if (originalEnabled === undefined) {
      delete process.env.MIRROR_LEDGER_ENABLED;
    } else {
      process.env.MIRROR_LEDGER_ENABLED = originalEnabled;
    }
  });

  it("queues mirror hint and emits mirror_hint event when repeats cross threshold", async () => {
    const signature = makeErrorSignature({ toolName: "exec", error: "Repeated failure" });
    mockQuery.mockReturnValue([createRow(signature), createRow(signature), createRow(signature)]);

    const onAgentEvent = vi.fn();

    const ctx = {
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
    } satisfies ToolHandlerContext;

    await handleToolExecutionEnd(ctx, {
      type: "tool_execution_end",
      toolName: "exec",
      toolCallId: "tool-1",
      isError: true,
      result: { error: "Repeated failure" },
    });

    const stateWithHints = ctx.state as ToolHandlerContext["state"] & {
      mirrorHints?: Array<Record<string, unknown>>;
    };

    expect(stateWithHints.mirrorHints?.length).toBe(1);
    expect(stateWithHints.mirrorHints?.[0]).toMatchObject({
      type: "mirror_hint",
      toolName: "exec",
      repeats: 3,
    });

    expect(onAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "mirror_hint", toolName: "exec", repeats: 3 }),
    );
  });
});
